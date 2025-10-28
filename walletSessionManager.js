/* WalletSessionManager.js — ensures clean connect/disconnect for multiple wallets */

class WalletSessionManager {
  constructor() {
    this.currentWallet = null;
    this.web3 = window.solanaWeb3 || window.web3 || window.web3js || null;
    this.detectedWallets = [];
    this._init();
  }

  _init() {
    // Detect wallets injected in window
    this.detectedWallets = this._detectWallets();
  }

  _detectWallets() {
    const wallets = [];
    if (window.solana?.isPhantom) wallets.push(window.solana);
    if (window.phantom?.solana?.isPhantom) wallets.push(window.phantom.solana);
    if (window.solflare?.isSolflare) wallets.push(window.solflare);
    if (window.Slope) try { wallets.push(new window.Slope()); } catch {}
    return wallets;
  }

  async disconnectAll() {
    for (const w of this.detectedWallets) {
      try {
        if (w?.disconnect) await w.disconnect();
      } catch (e) {
        console.warn('⚠️ Failed disconnect for wallet', w, e.message);
      }
    }
    this.currentWallet = null;
  }

  async connect(wallet) {
    // Force disconnect any previous session first
    await this.disconnectAll();

    if (!wallet) throw new Error('No wallet passed to connect()');
    this.currentWallet = wallet;

    // Connect and wait for public key
    let pubkey = null;
    try {
      if (!wallet.isConnected) {
        const resp = await wallet.connect();
        pubkey = resp?.publicKey?.toString?.();
      } else {
        pubkey = wallet.publicKey?.toString?.();
      }
    } catch (e) {
      throw new Error('Wallet connection failed: ' + e.message);
    }

    if (!pubkey) throw new Error('No public key returned from wallet');

    return { wallet: this.currentWallet, publicKey: pubkey };
  }

  getActiveWallet() {
    return this.currentWallet;
  }

  isConnected(wallet) {
    return wallet?.isConnected || (wallet?.publicKey != null);
  }

  detectAndConnect() {
    const active = this.detectedWallets.find(w => w.isConnected);
    return active ? this.connect(active) : null;
  }
}
