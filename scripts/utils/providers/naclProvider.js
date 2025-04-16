export class NaclCryptoProvider {
    constructor() {
        this.cryptoModule = null;
        this.initialized = false;
    }

    async init() {
        if (!this.initialized) {
            console.log('[NaCl Provider] Initializing...');

            if (typeof window !== 'undefined' && window.nacl) {
                console.log('[NaCl Provider] Using window.nacl');

                // Create basic cryptoModule with nacl utilities
                this.cryptoModule = {
                    Nacl: window.nacl,
                    encodeBase64: function(data) {
                        return window.nacl.util ? window.nacl.util.encodeBase64(data) :
                            window.btoa(String.fromCharCode.apply(null, data));
                    },
                    decodeBase64: function(str) {
                        return window.nacl.util ? window.nacl.util.decodeBase64(str) :
                            new Uint8Array(Array.from(window.atob(str), c => c.charCodeAt(0)));
                    },
                    encodeUTF8: function(bytes) {
                        if (!bytes) return '';
                        return window.nacl.util ? window.nacl.util.encodeUTF8(bytes) :
                            new TextDecoder().decode(bytes);
                    },
                    decodeUTF8: function(text) {
                        if (!text) return new Uint8Array(0);
                        return window.nacl.util ? window.nacl.util.decodeUTF8(text) :
                            new TextEncoder().encode(text);
                    }
                };

                // Import Mailbox implementation from chainpad_crypto if available
                if (window.chainpad_crypto && window.chainpad_crypto.Team) {
                    console.log('[NaCl Provider] Importing Team encryptor from chainpad_crypto');
                    this.cryptoModule.Mailbox = window.chainpad_crypto.Team;
                }
            }
            else if (typeof require !== 'undefined') {
                this.cryptoModule = require('./crypto.js');
            }
            else if (typeof window !== 'undefined' && window.chainpad_crypto) {
                this.cryptoModule = window.chainpad_crypto;
            }

            if (!this.cryptoModule || !this.cryptoModule.Nacl) {
                console.error('[NaCl Provider] Failed to initialize NaCl module');
                throw new Error('NaCl cryptography module not found');
            }

            this.initialized = true;
            console.log('[NaCl Provider] Initialization complete');
        }
        return true;
    }

    generateKEMKeyPair() {
        console.log('[NaCl Provider] Generating KEM key pair');
        const keypair = this.cryptoModule.Nacl.box.keyPair();
        return {
            publicKey: this.cryptoModule.encodeBase64(keypair.publicKey),
            secretKey: this.cryptoModule.encodeBase64(keypair.secretKey)
        };
    }

    generateDSAKeyPair() {
        console.log('[NaCl Provider] Generating DSA key pair');
        const keypair = this.cryptoModule.Nacl.sign.keyPair();
        return {
            publicKey: this.cryptoModule.encodeBase64(keypair.publicKey),
            secretKey: this.cryptoModule.encodeBase64(keypair.secretKey)
        };
    }

    createMailboxEncryptor(keys) {
        console.log('[NaCl Provider] Creating mailbox encryptor');
        return this.cryptoModule.Mailbox ?
            this.cryptoModule.Mailbox.createEncryptor(keys) :
            this.createMailboxEncryptorImpl(keys);
    }

    createMailboxEncryptorImpl(keys) {
        console.log('[NaCl Provider] Creating custom mailbox encryptor');
        const provider = this;

        return {
            encrypt: async function(data, recipientPublicKey) {
                console.log('[NaCl Mailbox] Encrypting data');

                const nonce = provider.cryptoModule.Nacl.randomBytes(24);

                const dataBytes = typeof data === 'string' ?
                    provider.textToBytes(data) : data;

                const senderSecretKey = typeof keys.curvePrivate === 'string' ?
                    provider.cryptoModule.decodeBase64(keys.curvePrivate) :
                    keys.curvePrivate;

                const recipientPubKey = typeof recipientPublicKey === 'string' ?
                    provider.cryptoModule.decodeBase64(recipientPublicKey) :
                    recipientPublicKey;

                const encryptedData = provider.cryptoModule.Nacl.box(
                    dataBytes,
                    nonce,
                    recipientPubKey,
                    senderSecretKey
                );

                if (!encryptedData) {
                    throw new Error('Encryption failed');
                }

                const signingKey = typeof keys.signingKey === 'string' ?
                    provider.cryptoModule.decodeBase64(keys.signingKey) :
                    keys.signingKey;

                const signature = provider.cryptoModule.Nacl.sign.detached(
                    dataBytes,
                    signingKey
                );

                return {
                    encryptedData,
                    nonce,
                    signature,
                    senderPublicKey: keys.signingKey,
                    senderCurvePublicKey: keys.curvePublic,
                    data: dataBytes
                };
            },

            decrypt: async function(message, senderPublicKey) {
                console.log('[NaCl Mailbox] Decrypting data');

                if (!message || !senderPublicKey) {
                    throw new Error('Invalid message or sender public key');
                }

                const { encryptedData, nonce, signature, data, senderCurvePublicKey } = message;

                if (!encryptedData || !nonce || !signature || !senderCurvePublicKey) {
                    throw new Error('Incomplete message structure');
                }

                try {
                    const senderPubSigningKey = typeof senderPublicKey === 'string' ?
                        provider.cryptoModule.decodeBase64(senderPublicKey) :
                        senderPublicKey;

                    const verifiedData = data || new Uint8Array(0);

                    const isValid = provider.cryptoModule.Nacl.sign.detached.verify(
                        verifiedData,
                        signature,
                        senderPubSigningKey
                    );

                    if (!isValid) {
                        throw new Error('Invalid signature');
                    }

                    console.log('[NaCl Mailbox] Signature verified');

                    const recipientSecretKey = typeof keys.curvePrivate === 'string' ?
                        provider.cryptoModule.decodeBase64(keys.curvePrivate) :
                        keys.curvePrivate;

                    const senderCurvePubKey = typeof senderCurvePublicKey === 'string' ?
                        provider.cryptoModule.decodeBase64(senderCurvePublicKey) :
                        senderCurvePublicKey;

                    const decryptedBytes = provider.cryptoModule.Nacl.box.open(
                        encryptedData,
                        nonce,
                        senderCurvePubKey,
                        recipientSecretKey
                    );

                    if (decryptedBytes === null || decryptedBytes === undefined) {
                        throw new Error('Decryption failed');
                    }

                    return decryptedBytes;
                } catch (error) {
                    console.error('[NaCl Mailbox] Decryption error:', error);
                    throw error;
                }
            }
        };
    }

    textToBytes(text) {
        if (text === null || text === undefined) {
            return new Uint8Array(0);
        }

        if (text instanceof Uint8Array) {
            return text;
        }

        try {
            const textStr = String(text);

            if (!this.cryptoModule || !this.cryptoModule.decodeUTF8) {
                return new TextEncoder().encode(textStr);
            }

            return this.cryptoModule.decodeUTF8(textStr);
        } catch (err) {
            console.error('[NaCl Provider] Error converting text to bytes:', err);
            return new Uint8Array(0);
        }
    }
}

// Creates a NaCl provider with context-safe methods
export function createNaclProvider() {
    const provider = new NaclCryptoProvider();

    // Preserve the cryptoModule reference in a closure
    let cryptoModuleRef = null;

    // Override textToBytes to be context-safe
    provider.textToBytes = function(text) {
        if (!cryptoModuleRef && this.cryptoModule) {
            cryptoModuleRef = this.cryptoModule;
        }

        if (text === null || text === undefined) {
            return new Uint8Array(0);
        }

        if (text instanceof Uint8Array) {
            return text;
        }

        try {
            const textStr = String(text);

            if (cryptoModuleRef && cryptoModuleRef.decodeUTF8) {
                return cryptoModuleRef.decodeUTF8(textStr);
            } else {
                return new TextEncoder().encode(textStr);
            }
        } catch (err) {
            console.error('[NaCl Provider] Error converting text to bytes:', err);
            return new Uint8Array(0);
        }
    };

    // Make init() update our cached reference
    const originalInit = provider.init;
    provider.init = async function() {
        const result = await originalInit.call(this);
        cryptoModuleRef = this.cryptoModule;
        return result;
    };

    return provider;
}