import { MultiRecipientCrypto } from '../utils/multiRecipientCrypto.js';
import { getCryptoProvider, CRYPTO_SCHEMES } from '../utils/cryptoProvider.js';

export class User {
    constructor(id, cryptoScheme = CRYPTO_SCHEMES.PQC) {
        this.id = id;
        this.cryptoScheme = cryptoScheme;
        this.kemKeys = null;
        this.signKeys = null;
        this.multiRecipientCrypto = null;
        this.stats = [];
    }

    async init() {
        try {
            const cryptoProvider = getCryptoProvider(this.cryptoScheme);
            await cryptoProvider.init();

            this.kemKeys = await cryptoProvider.generateKEMKeyPair();

            this.signKeys = await cryptoProvider.generateDSAKeyPair();

            this.multiRecipientCrypto = new MultiRecipientCrypto(this, this.cryptoScheme);

            await this.multiRecipientCrypto.init();

            return true;
        } catch (error) {
            console.error(`[User ${this.id}] Initialization failed:`, error);
            return false;
        }
    }

    async ensureCryptoInitialized() {
        if (!this.multiRecipientCrypto) {
            this.multiRecipientCrypto = new MultiRecipientCrypto(this, this.cryptoScheme);
        }
        return this.multiRecipientCrypto.ensureInitialized();
    }

    async encryptAndSignBlockForMany(data, recipientPublicKeys) {
        try {
            await this.ensureCryptoInitialized();

            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

            return await this.multiRecipientCrypto.createSharedBlock(dataStr, recipientPublicKeys);
        } catch (error) {
            console.error(`[User ${this.id}] Failed to encrypt and sign block:`, error);
            throw error;
        }
    }

    async decryptAndVerifyBlock(block) {
        try {
            await this.ensureCryptoInitialized();
            return await this.multiRecipientCrypto.decryptSharedBlock(block);
        } catch (error) {
            console.error(`[User ${this.id}] Failed to decrypt and verify block:`, error);
            throw error;
        }
    }
}
