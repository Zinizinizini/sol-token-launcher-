/* reclaim_rent_v1.js — Standalone browser plugin
   Drop this file into your repo and load it AFTER your base HTML (below the base scripts).
*/

(async function(){
  console.log('🔧 ReclaimRent Module (standalone) loaded');

  // CONFIG: uses same Helius key you used in base (change if you rotate)
  const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=b933e448-6fee-4016-b4ec-3c6c19a46775';
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

  // Helper: safe wait
  const wait = (ms)=> new Promise(r=>setTimeout(r,ms));

  // Wait for web3 global to show up (IIFE build)
  let web3Global = window.solanaWeb3 || window.web3 || window.web3js || null;
  const waitStart = Date.now();
  while(!web3Global && (Date.now() - waitStart) < 7000) {
    await wait(150);
    web3Global = window.solanaWeb3 || window.web3 || window.web3js || null;
  }
  if (!web3Global) {
    console.error('❌ reclaim_rent: solana web3 global not found. Ensure the base loaded the iife web3 bundle.');
    return;
  }
  const web3 = web3Global;

  // DOM elements we will reuse
  const logsEl = document.getElementById('logs') || (function(){ const d=document.createElement('div'); d.id='logs'; document.body.appendChild(d); return d; })();
  const app = document.getElementById('walletApp') || document.body;

  function log(msg){
    console.log(msg);
    if (logsEl) logsEl.innerText += msg + '\n';
    if (logsEl) logsEl.scrollTop = logsEl.scrollHeight;
  }

  // Detect injected wallets (Phantom/Solflare/Slope)
  function detectWallet() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana; // fallback
    if (window.solflare && window.solflare.isSolflare) return window.solflare;
    if (window.Slope) {
      try { return new window.Slope(); } catch(e){ /* ignore */ }
    }
    return null;
  }

  // Build connection (Helius)
  let connection;
  try {
    connection = new web3.Connection(HELIUS_RPC, 'confirmed');
    log('✅ ReclaimRent: connected to Helius RPC.');
  } catch (e) {
    log('⚠️ ReclaimRent: failed to create Helius connection: ' + e.message);
    return;
  }

  // Main reclaim function
  async function reclaimRent() {
    log('🧹 Reclaim Rent started...');
    const wallet = detectWallet();
    if (!wallet) { log('❌ No wallet detected. Install/enable Phantom or Solflare and reload.'); return; }

    // Ensure user is connected (if not, prompt)
    let pubkey;
    try {
      // some wallets expose isConnected; try to get publicKey
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

    log(`🪣 Found ${empty.length} empty token account(s). Attempting to close them one-by-one...`);

    // For each empty account, build a closeAccount instruction and send via wallet
    for (const entry of empty) {
      const tokenAcctPubkey = entry.pubkey;
      try {
        // Build close instruction manually (SPL Token close account = 9)
        const keys = [
          { pubkey: tokenAcctPubkey, isSigner: false, isWritable: true },
          { pubkey: new web3.PublicKey(pubkey), isSigner: false, isWritable: true }, // dest
          { pubkey: new web3.PublicKey(pubkey), isSigner: true, isWritable: false } // authority
        ];
        const ix = new web3.TransactionInstruction({
          keys,
          programId: new web3.PublicKey(TOKEN_PROGRAM),
          data: Buffer.from([9]) // CloseAccount instruction index
        });

        const tx = new web3.Transaction().add(ix);
        tx.feePayer = new web3.PublicKey(pubkey);
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;

        // Sign via injected wallet. Different wallets expose different APIs:
        // Phantom/Solflare: wallet.signTransaction(tx) or wallet.signAndSendTransaction
        let signedTx;
        if (wallet.signTransaction) {
          signedTx = await wallet.signTransaction(tx);
          // send raw
          const raw = signedTx.serialize();
          const sig = await connection.sendRawTransaction(raw);
          await connection.confirmTransaction(sig, 'confirmed');
          log(`✅ Closed ${tokenAcctPubkey.toString()} — tx ${sig}`);
        } else if (wallet.signAndSendTransaction) {
          // some wallets provide signAndSendTransaction (returns signature)
          const res = await wallet.signAndSendTransaction(tx);
          const sig = res?.signature || res;
          await connection.confirmTransaction(sig, 'confirmed');
          log(`✅ Closed ${tokenAcctPubkey.toString()} — tx ${sig}`);
        } else {
          throw new Error('Wallet does not support signTransaction or signAndSendTransaction');
        }

        // small pause between txs
        await wait(600);
      } catch (err) {
        log(`❌ Failed to close ${tokenAcctPubkey.toString()}: ${err?.message || String(err)}`);
      }
    }

    log('🎉 Reclaim run complete.');
  }

  // Add UI button if not already present
  const existing = document.getElementById('reclaimRentBtn');
  if (!existing) {
    const btn = document.createElement('button');
    btn.id = 'reclaimRentBtn';
    btn.textContent = '🧹 Reclaim Rent';
    btn.style.background = '#007bff';
    btn.style.color = '#fff';
    btn.style.marginTop = '10px';
    btn.onclick = reclaimRent;
    // append after walletApp if present
    const walletApp = document.getElementById('walletApp');
    if (walletApp) walletApp.appendChild(btn);
    else document.body.appendChild(btn);
  }

})();
