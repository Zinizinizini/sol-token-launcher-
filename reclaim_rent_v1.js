(async function() {
  console.log('🔧 ReclaimRent Module Loaded');

  // Wait until Base DApp fully ready
  while (!window.SolanaDApp || !window.SolanaDApp.getConnection) {
    await new Promise(r => setTimeout(r, 300));
  }

  const { getConnection, getPublicKey, getWallet } = window.SolanaDApp;
  const web3 = window.solanaWeb3 || window.web3 || window.web3js;
  const TOKEN_PROGRAM_ID = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  const logsEl = document.getElementById('logs');
  function logStep(msg) {
    console.log(msg);
    if (logsEl) {
      logsEl.innerText += msg + '\n';
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  }

  async function reclaimRent() {
    const wallet = getWallet();
    const publicKey = getPublicKey();
    const connection = getConnection();

    if (!wallet || !publicKey || !connection) {
      alert('Wallet not connected!');
      return;
    }

    logStep('🧹 Starting rent reclaim scan...');

    // 1️⃣ Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new web3.PublicKey(publicKey),
      { programId: TOKEN_PROGRAM_ID }
    );

    const emptyAccounts = tokenAccounts.value.filter(
      acc => acc.account.data.parsed.info.tokenAmount.uiAmount === 0
    );

    if (emptyAccounts.length === 0) {
      logStep('✅ No empty token accounts found. Nothing to reclaim.');
      return;
    }

    logStep(`🪣 Found ${emptyAccounts.length} empty token accounts. Closing...`);

    // 2️⃣ Build closeAccount instructions
    for (const { pubkey } of emptyAccounts) {
      try {
        const tx = new web3.Transaction().add({
          keys: [
            { pubkey, isSigner: false, isWritable: true },
            { pubkey: new web3.PublicKey(publicKey), isSigner: false, isWritable: true },
            { pubkey: new web3.PublicKey(publicKey), isSigner: true, isWritable: false }
          ],
          programId: TOKEN_PROGRAM_ID,
          data: Buffer.from([9]) // closeAccount instruction (SPL Token Program)
        });

        tx.feePayer = new web3.PublicKey(publicKey);
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const signedTx = await wallet.wallet.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
        logStep(`✅ Closed account ${pubkey.toBase58()} — tx: ${sig}`);
      } catch (err) {
        logStep(`❌ Failed to close ${pubkey.toBase58()}: ${err.message}`);
      }
    }

    logStep('🎉 Rent reclaim complete!');
  }

  // Add a small UI button dynamically
  const app = document.getElementById('walletApp');
  const btn = document.createElement('button');
  btn.textContent = '🧹 Reclaim Rent';
  btn.style.background = '#007bff';
  btn.style.marginTop = '10px';
  btn.onclick = reclaimRent;
  app.appendChild(btn);
})();
