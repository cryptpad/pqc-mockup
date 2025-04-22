import { loadCryptoModule } from './cryptoLoader.js';

export class NaclCryptoProvider {
    constructor() {
        this.cryptoModule = null;
        this.initialized = false;
        this.initPromise = null;
    }

    async init() {
        if (this.initialized) {
            return true;
        }
        
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                this.cryptoModule = await loadCryptoModule();
                
                if (!this.cryptoModule) {
                    throw new Error('Failed to load chainpad_crypto module');
                }

                if (!this.cryptoModule.Nacl) {
                    throw new Error('Nacl implementation not found in crypto module');
                }

                if (!this.cryptoModule.Mailbox) {
                    throw new Error('Mailbox implementation not found in crypto module');
                }

                this.initialized = true;
                resolve(true);
            } catch (error) {
                console.error('[NaCl Provider] Initialization failed:', error);
                this.initPromise = null;
                reject(error);
            }
        });

        return this.initPromise;
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.init();
        }
        return this.initialized;
    }

    async generateKEMKeyPair() {
        await this.ensureInitialized();
        const keypair = this.cryptoModule.Nacl.box.keyPair();
        return {
            publicKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.publicKey),
            secretKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.secretKey)
        };
    }

    async generateDSAKeyPair() {
        await this.ensureInitialized();
        const keypair = this.cryptoModule.Nacl.sign.keyPair();
        return {
            publicKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.publicKey),
            secretKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.secretKey)
        };
    }

    async createMailboxEncryptor(keys) {
        await this.ensureInitialized();
        
        if (!this.cryptoModule || !this.cryptoModule.Mailbox) {
            throw new Error('Crypto module or Mailbox not available');
        }
        
        try {
            const mailboxEncryptor = this.cryptoModule.Mailbox.createEncryptor(keys);
            
            return {
                encrypt: async (plain, recipient) => {
                    try {
                        if (!mailboxEncryptor.encrypt) {
                            throw new Error('Encryptor is missing encrypt method');
                        }
                        return mailboxEncryptor.encrypt(plain, recipient);
                    } catch (err) {
                        console.error('[NaCl Provider] Encryption failed:', err);
                        throw err;
                    }
                },
                decrypt: async (cipher, validateKey) => {
                    try {
                        if (!mailboxEncryptor.decrypt) {
                            throw new Error('Encryptor is missing decrypt method');
                        }
                        
                        const skipValidation = !validateKey;
                        
                        return mailboxEncryptor.decrypt(cipher, validateKey, skipValidation);
                    } catch (err) {
                        console.error('[NaCl Provider] Decryption failed:', err);
                        throw err;
                    }
                }
            };
        } catch (error) {
            console.error('[NaCl Provider] Error creating mailbox encryptor:', error);
            throw error;
        }
    }

    async textToBytes(text) {
        await this.ensureInitialized();

        if (text === null || text === undefined) {
            return new Uint8Array(0);
        }

        if (text instanceof Uint8Array) {
            return text;
        }

        try {
            const textStr = String(text);
            if (this.cryptoModule.Nacl && this.cryptoModule.Nacl.util && this.cryptoModule.Nacl.util.decodeUTF8) {
                return this.cryptoModule.Nacl.util.decodeUTF8(textStr);
            }
            else if (this.cryptoModule.decodeUTF8) {
                return this.cryptoModule.decodeUTF8(textStr);
            }
            else {
                return new TextEncoder().encode(textStr);
            }
        } catch (err) {
            console.error('[NaCl Provider] Error converting text to bytes:', err);
            return new Uint8Array(0);
        }
    }

    async bytesToText(bytes) {
        await this.ensureInitialized();

        if (!bytes) {
            return '';
        }

        try {
            if (this.cryptoModule.Nacl && this.cryptoModule.Nacl.util && this.cryptoModule.Nacl.util.encodeUTF8) {
                return this.cryptoModule.Nacl.util.encodeUTF8(bytes);
            }
            else if (this.cryptoModule.encodeUTF8) {
                return this.cryptoModule.encodeUTF8(bytes);
            }
            else {
                return new TextDecoder().decode(bytes);
            }
        } catch (err) {
            console.error('[NaCl Provider] Error converting bytes to text:', err);
            return '';
        }
    }
}

export function createNaclProvider() {
    return new NaclCryptoProvider();
}
