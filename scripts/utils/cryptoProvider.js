import { createNaclProvider } from './providers/naclProvider.js';
import { createPQCProvider } from './providers/pqcProvider.js';

export const CRYPTO_SCHEMES = {
    PQC: 'pqc',
    NACL: 'nacl'
};

export const ENCRYPTOR_TYPES = {
    MAILBOX: 'mailbox',
    TEAM: 'team'
};

export function getCryptoProvider(scheme = CRYPTO_SCHEMES.PQC) {
    console.log(`[CryptoProvider] Creating provider for scheme: ${scheme}`);
    if (scheme === CRYPTO_SCHEMES.NACL) {
        console.log('[CryptoProvider] Using NaCl (TweetNaCl) implementation');
        return createNaclProvider();
    } else {
        console.log('[CryptoProvider] Using Post-Quantum Cryptography (ML-KEM/ML-DSA) implementation');
        return createPQCProvider();
    }
}
