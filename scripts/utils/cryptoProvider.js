import { createNaclProvider } from './providers/naclProvider.js';
import { createPQCProvider } from './providers/pqcProvider.js';

export const CRYPTO_SCHEMES = {
    PQC: 'pqc',
    NACL: 'nacl'
};

export function getCryptoProvider(scheme = CRYPTO_SCHEMES.PQC) {
    if (scheme === CRYPTO_SCHEMES.NACL) {
        return createNaclProvider();
    } else {
        return createPQCProvider();
    }
}