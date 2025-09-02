// SPDX-FileCopyrightText: 2025 XWiki CryptPad Team <contact@cryptpad.org> and Iulian-Tudor Scutaru
//
// SPDX-License-Identifier: AGPL-3.0-or-later

export function loadCryptoModule() {
    return new Promise((resolve, reject) => {
        if (typeof require !== 'undefined') {
            try {
                const naclFast = require('tweetnacl/nacl-fast');
                const naclUtil = require('tweetnacl-util');
                
                const cryptoModule = require('./crypto.js');
                
                if (!cryptoModule.Nacl) {
                    cryptoModule.Nacl = naclFast;
                    if (!cryptoModule.Nacl.util) {
                        cryptoModule.Nacl.util = naclUtil;
                    }
                }
                
                resolve(cryptoModule);
            } catch (error) {
                reject(error);
            }
            return;
        }

        if (typeof window !== 'undefined') {
            if (window.chainpad_crypto) {
                setupNaclUtil();
                
                if (window.nacl && !window.chainpad_crypto.Nacl) {
                    window.chainpad_crypto.Nacl = window.nacl;
                }
                
                resolve(window.chainpad_crypto);
                return;
            }

            const naclLoaded = window.nacl !== undefined;
            const naclUtilLoaded = window.nacl?.util !== undefined || 
                                   window.nacl_util !== undefined;
            
            if (naclLoaded && naclUtilLoaded) {
                setupNaclUtil();

                const script = document.createElement('script');
                script.src = '/scripts/utils/providers/crypto.js';
                script.onload = () => {
                    if (window.chainpad_crypto) {
                        if (window.nacl && !window.chainpad_crypto.Nacl) {
                            window.chainpad_crypto.Nacl = window.nacl;
                        }
                        resolve(window.chainpad_crypto);
                    } else {
                        setTimeout(() => {
                            if (window.chainpad_crypto) {
                                if (window.nacl && !window.chainpad_crypto.Nacl) {
                                    window.chainpad_crypto.Nacl = window.nacl;
                                }
                                resolve(window.chainpad_crypto);
                            } else {
                                reject(new Error('crypto.js loaded but chainpad_crypto not defined'));
                            }
                        }, 500);
                    }
                };
                script.onerror = () => reject(new Error('Failed to load crypto.js'));
                document.head.appendChild(script);
                return;
            }

            const loadScript = (src) => {
                return new Promise((resolveScript, rejectScript) => {
                    const script = document.createElement('script');
                    script.src = src;
                    script.onload = () => resolveScript();
                    script.onerror = () => rejectScript(new Error(`Failed to load ${src}`));
                    document.head.appendChild(script);
                });
            };

            loadScript('/components/tweetnacl/nacl-fast.min.js')
                .then(() => loadScript('/components/tweetnacl-util/nacl-util.min.js'))
                .then(() => {
                    setupNaclUtil();
                    return loadScript('/scripts/utils/providers/crypto.js');
                })
                .then(() => {
                    return new Promise((resolveWait) => {
                        let attempts = 0;
                        const maxAttempts = 20;
                        
                        const checkModule = () => {
                            attempts++;
                            if (window.chainpad_crypto) {
                                if (window.nacl && !window.chainpad_crypto.Nacl) {
                                    window.chainpad_crypto.Nacl = window.nacl;
                                }
                                
                                if (window.nacl && !window.nacl.util && window.nacl_util) {
                                    window.nacl.util = window.nacl_util;
                                }
                                
                                if (!window.chainpad_crypto.Mailbox) {
                                    try {
                                        if (typeof window.chainpad_crypto === 'function') {
                                            window.chainpad_crypto = window.chainpad_crypto(window.nacl, window.nacl.util);
                                        }
                                    } catch (e) {
                                        console.error('[CryptoLoader] Failed to initialize Mailbox:', e);
                                    }
                                }
                                
                                resolveWait(window.chainpad_crypto);
                            } else if (attempts < maxAttempts) {
                                setTimeout(checkModule, 100);
                            } else {
                                reject(new Error('Failed to load chainpad_crypto module'));
                            }
                        };
                        setTimeout(checkModule, 100);
                    });
                })
                .then(resolve)
                .catch(reject);
        } else {
            reject(new Error('Unable to determine environment (not browser or Node.js)'));
        }
    });

    function setupNaclUtil() {
        if (window.nacl) {
            if (!window.nacl.util && window.nacl_util) {
                window.nacl.util = window.nacl_util;
            }
            
            if (!window.nacl.util && typeof window.nacl.encodeBase64 === 'function') {
                window.nacl.util = {
                    encodeBase64: window.nacl.encodeBase64,
                    decodeBase64: window.nacl.decodeBase64,
                    encodeUTF8: window.nacl.encodeUTF8,
                    decodeUTF8: window.nacl.decodeUTF8
                };
            }
            
            if (!window.nacl.util) {
                window.nacl.util = {
                    encodeBase64: (arr) => {
                        try {
                            return btoa(String.fromCharCode.apply(null, new Uint8Array(arr)));
                        } catch (e) {
                            console.error('[CryptoLoader] encodeBase64 error:', e);
                            return '';
                        }
                    },
                    decodeBase64: (str) => {
                        try {
                            const binary = atob(str);
                            const arr = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) {
                                arr[i] = binary.charCodeAt(i);
                            }
                            return arr;
                        } catch (e) {
                            console.error('[CryptoLoader] decodeBase64 error:', e);
                            return new Uint8Array(0);
                        }
                    },
                    encodeUTF8: (arr) => {
                        try {
                            return new TextDecoder().decode(arr);
                        } catch (e) {
                            console.error('[CryptoLoader] encodeUTF8 error:', e);
                            return '';
                        }
                    },
                    decodeUTF8: (str) => {
                        try {
                            return new TextEncoder().encode(str);
                        } catch (e) {
                            console.error('[CryptoLoader] decodeUTF8 error:', e);
                            return new Uint8Array(0);
                        }
                    }
                };
            }
        }
    }
}
