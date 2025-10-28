/* reclaim_rent_v1.1.js — Standalone browser plugin
   Drop this file into your repo and load it AFTER your base HTML (below the base scripts).
*/

(async function(){
  console.log('🔧 ReclaimRent Module v1.1 loaded');

  // CONFIG
  const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=b933e448-6fee-4016-b4ec-3c6c19a46775';
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const WAIT_MS = 150;

  // Helper: safe wait
  const wait = (ms)=> new Promise(r=>setTimeout(r,ms));

  // Wait for web3 global to show up
  let web3Global = window.solanaWeb3 || window.web3 || window.web3js || null;
  const waitStart = Date.now();
  while(!web3Global && (Date.now() - waitStart) < 7000) {
    await wait(WAIT_MS);
    web3Global = window.solanaWeb3 || window.web3 || window.web3js || null;
  }
  if (!web3Global) {
    console.error('❌ reclaim_rent: solana web3 global not found. Ensure the base loaded the iife web3 bundle.');
    return;
  }
  const web3 = web3Global;

  // DOM elements
  const logsEl = document.getElementById('logs') || (function(){
    const d=document.createElement('div'); d.id='logs'; document.body.appendChild(d); return d;
  })();

  function clearLogs() {
    if (logsEl) logsEl.innerText = '';
  }

  function log(msg){
    console.log(msg);
    if (logsEl) {
      logsEl.innerText += msg + '\n';
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  }

  // Detect active wallet
  function detectWallet() {
    const providers = [];
    if (window.solana?.isPhantom) providers.push(window.solana);
    if (window.phantom?.solana?.isPhantom) providers.push(window.phantom.solana);
    if (window.solflare?.isSolflare) providers.push(window.solflare);
    if (window.Slope) try { providers.push(new window.Slope()); } catch {}
    // pick the wallet actually connected
    const active = providers.find(p => p?.isConnected || (p?.publicKey && typeof p.publicKey?.toBase58 === 'function'));
    return active || providers[0] || null;
  }

  // Build Helius connection
  let connection;
  try {
    connection = new web3.Connection(HELIUS_RPC, 'confirmed');
    log('✅ ReclaimRent v1.1: connected to Helius RPC.');
  } catch (e) {
    log('⚠️ Failed to create Helius connection: ' + e.message);
    return;
  }

  // Force disconnect any stale wallets
  async function disconnectAllWallets() {
    if (window.solana?.disconnect) try { await window.solana.disconnect(); } catch {}
    if (window.phantom?.solana?.disconnect) try { await window.phantom.solana.disconnect(); } catch {}
    if (window.solflare?.disconnect) try { await window.solflare.disconnect(); } catch {}
  }

  // Main reclaim function
  async function reclaimRent() {
    clearLogs();
    log('🧹 Reclaim Rent started...');

    await disconnectAllWallets();

    const wallet = detectWallet();
    if (!wallet) { log('❌ No wallet detected. Install/enable Phantom or Solflare.'); return; }

    let pubkey;
    try {
      pubkey = wallet.publicKey?.toString?.() || null;
      if (!pubkey) {
        log('🔐 Prompting wallet for connection...');
        const resp = await wallet.connect();
        pubkey = resp?.publicKey?.toString?.() || wallet.publicKey?.toString?.();
      }
    } catch (e) {
      log('❌ Wallet connect cancelled / failed: ' + e.message);
      return;
    }
    if (!pubkey) { log('❌ No public key available after connect.'); return; }

    log('Connected wallet: ' + pubkey);

    // fetch token accounts
    let tokenAccounts;
    try {
      tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new web3.PublicKey(pubkey),
        { programId: new web3.PublicKey(TOKEN_PROGRAM) }
      );
    } catch (e) {
      log('❌ Failed to fetch token accounts: ' + e.message);
      return;
    }

    const empty = tokenAccounts.value.filter(t => {
      try { return Number(t.account.data.parsed.info.tokenAmount.uiAmount) === 0; }
      catch { return false; }
    });

    if (empty.length === 0) {
      log('✅ No empty token accounts found — nothing to reclaim.');
      return;
    }

    log(`🪣 Found ${empty.length} empty token account(s). Closing...`);

    for (const entry of empty) {
      const tokenAcctPubkey = entry.pubkey;
      try {
        const keys = [
          { pubkey: tokenAcctPubkey, isSigner: false, isWritable: true },
          { pubkey: new web3.PublicKey(pubkey), isSigner: false, isWritable: true },
          { pubkey: new web3.PublicKey(pubkey), isSigner: true, isWritable: false }
        ];
        const ix = new web3.TransactionInstruction({
          keys,
          programId: new web3.PublicKey(TOKEN_PROGRAM),
          data: Buffer.from([9])
        });

        const tx = new web3.Transaction().add(ix);
        tx.feePayer = new web3.PublicKey(pubkey);
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;

        let signedTx;
        if (wallet.signTransaction) {
          signedTx = await wallet.signTransaction(tx);
          const raw = signedTx.serialize();
          const sig = await connection.sendRawTransaction(raw);
          await connection.confirmTransaction(sig, 'confirmed');
          log(`✅ Closed ${tokenAcctPubkey.toString()} — tx ${sig}`);
        } else if (wallet.signAndSendTransaction) {
          const res = await wallet.signAndSendTransaction(tx);
          const sig = res?.signature || res;
          await connection.confirmTransaction(sig, 'confirmed');
          log(`✅ Closed ${tokenAcctPubkey.toString()} — tx ${sig}`);
        } else {
          throw new Error('Wallet does not support signTransaction or signAndSendTransaction');
        }

        await wait(600);
      } catch (err) {
        log(`❌ Failed to close ${tokenAcctPubkey.toString()}: ${err?.message || String(err)}`);
      }
    }

    log('🎉 Reclaim run complete.');
  }

  // Add UI button if not present
  if (!document.getElementById('reclaimRentBtn')) {
    const btn = document.createElement('button');
    btn.id = 'reclaimRentBtn';
    btn.textContent = '🧹 Reclaim Rent';
    btn.style.background = '#007bff';
    btn.style.color = '#fff';
    btn.style.marginTop = '10px';
    btn.onclick = reclaimRent;
    const walletApp = document.getElementById('walletApp');
    if (walletApp) walletApp.appendChild(btn);
    else document.body.appendChild(btn);
  }

})();
