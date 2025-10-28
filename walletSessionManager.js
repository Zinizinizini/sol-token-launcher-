/* walletSessionManager.js — Manage wallet sessions safely */
class WalletSessionManager {
  constructor() {
    this.activeWallet = null;   // The currently connected wallet object
    this.publicKey = null;      // Base58 string of active wallet's public key
  }

  /**
   * Connect a wallet.
   * @param {object} walletObj - The injected wallet object (Phantom, Solflare, Slope)
   * @returns {Promise<{wallet: object, publicKey: string}>}
   */
  async connect(walletObj) {
    if (!walletObj) throw new Error('No wallet object provided');

    // If there is already an active wallet, disconnect it first
    if (this.activeWallet && this.activeWallet !== walletObj) {
      await this.disconnect();
    }

    try {
      let pubkey;

      // Wallet might already be connected
      if (walletObj.isConnected && walletObj.publicKey) {
        pubkey = walletObj.publicKey.toString();
      } else if (walletObj.publicKey && walletObj.publicKey.toBase58) {
        pubkey = walletObj.publicKey.toBase58();
      } else {
        // Prompt connection
        const resp = await walletObj.connect();
        pubkey = resp?.publicKey?.toString() || walletObj.publicKey?.toString();
      }

      if (!pubkey) throw new Error('Unable to get public key from wallet');

      this.activeWallet = walletObj;
      this.publicKey = pubkey;

      console.log('🟢 WalletSessionManager: Connected wallet', pubkey);
      return { wallet: walletObj, publicKey: pubkey };
    } catch (err) {
      console.error('❌ WalletSessionManager: Failed to connect wallet:', err.message);
      throw err;
    }
  }

  /**
   * Disconnect the currently active wallet
   */
  async disconnect() {
    if (!this.activeWallet) return;

    try {
      if (this.activeWallet.disconnect) {
        await this.activeWallet.disconnect();
      } else if (this.activeWallet.signOut) {
        await this.activeWallet.signOut();
      }
      console.log('⚪ WalletSessionManager: Disconnected wallet', this.publicKey);
    } catch (err) {
      console.warn('⚠️ WalletSessionManager: Error during disconnect:', err.message);
    } finally {
      this.activeWallet = null;
      this.publicKey = null;
    }
  }

  /**
   * Disconnect all known wallets injected in window
   */
  async disconnectAll() {
    const wallets = [
      window.solana,
      window.phantom?.solana,
      window.solflare,
    ];

    for (const w of wallets) {
      if (!w) continue;
      try {
        if (w.disconnect) await w.disconnect();
        else if (w.signOut) await w.signOut();
        console.log('⚪ WalletSessionManager: Disconnected', w?.publicKey?.toString() || w);
      } catch (err) {
        console.warn('⚠️ WalletSessionManager: Failed to disconnect wallet:', err.message);
      }
    }

    // Clear active wallet reference
    this.activeWallet = null;
    this.publicKey = null;
  }
}

// Singleton instance
window.walletSessionManager = new WalletSessionManager();
