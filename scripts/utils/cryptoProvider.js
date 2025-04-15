import * as pqcCrypto from './pqcCrypto.js';

export const CRYPTO_SCHEMES = {
    PQC: 'pqc',
    NACL: 'nacl'
};

export function getCryptoProvider(scheme = CRYPTO_SCHEMES.PQC) {
    if (scheme === CRYPTO_SCHEMES.NACL) {
        return new NaclCryptoProvider();
    } else {
        return {
            generateKEMKeyPair: pqcCrypto.generateKEMKeyPair,
            generateDSAKeyPair: pqcCrypto.generateDSAKeyPair,
            encapsulateSecret: pqcCrypto.encapsulateSecret,
            decapsulateSecret: pqcCrypto.decapsulateSecret,
            encryptData: pqcCrypto.encryptData,
            decryptData: pqcCrypto.decryptData,
            signData: pqcCrypto.signData,
            verifySignature: pqcCrypto.verifySignature,
            verifyAndDecryptBlock: pqcCrypto.verifyAndDecryptBlock,
            textToBytes: pqcCrypto.textToBytes,
            bytesToText: pqcCrypto.bytesToText,
            createMailboxEncryptor: pqcCrypto.createMailboxEncryptor,
            init: async () => true
        };
    }
}