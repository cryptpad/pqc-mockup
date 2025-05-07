export class SimulationAnalytics {
    constructor() {
        this.documentStats = [];
        this.userStats = [];
        this.distributionUsed = false;
        this.simulationTimestamp = null;
        this.executionTime = 0;
        this.cryptoSizes = {
            scheme: 'N/A',
            keyPairs: {
                kem: { publicKeySize: 0, privateKeySize: 0 },
                signature: { publicKeySize: 0, privateKeySize: 0 }
            },
            messages: { ciphertextSize: 0, signatureSize: 0 },
            count: 0,
            averageTime: { encrypt: 0, decrypt: 0, sign: 0, verify: 0 }
        };
    }

    trackSimulation(users, documents, useDistribution) {
        if (!Array.isArray(users) || !Array.isArray(documents)) {
            throw new Error('Invalid input: users and documents must be arrays');
        }

        this.simulationTimestamp = new Date();
        this.distributionUsed = !!useDistribution;

        this.documentStats = this.collectDocumentStats(documents);

        this.userStats = this.collectUserStats(users);
        
        // Track crypto key and message sizes
        this.trackCryptoSizes(users);

        return {
            documentCount: this.documentStats.length,
            userCount: this.userStats.length,
            timestamp: this.simulationTimestamp
        };
    }

    collectDocumentStats(documents) {
        try {
            return documents.map(doc => ({
                documentId: doc.id,
                id: doc.id,
                editorCount: doc.editors?.size || 0,
                totalEdits: doc.edits || 0,
                editorsIds: [...(doc.editors || new Set())],
                editorsPerEdit: doc.editors?.size > 0 ? doc.edits / doc.editors.size : 0,
                editsByUser: doc.editsByUser || []
            }));
        } catch (error) {
            console.error('Error collecting document statistics:', error);
            return [];
        }
    }

    collectUserStats(users) {
        try {
            return users
                .filter(user => user && Array.isArray(user.stats) && user.stats.length > 0)
                .map(user => {
                    const encryptStats = user.stats.filter(s => s.encryptTime > 0);
                    const signStats = user.stats.filter(s => s.signTime > 0);
                    const decryptStats = user.stats.filter(s => s.decryptTime > 0);
                    const verifyStats = user.stats.filter(s => s.verifyTime > 0);
                    const errorStats = user.stats.filter(s => s.error);

                    return {
                        id: user.id,
                        userId: user.id,
                        encryptTime: this.calculateAverage(encryptStats, 'encryptTime'),
                        signTime: this.calculateAverage(signStats, 'signTime'),
                        decryptTime: this.calculateAverage(decryptStats, 'decryptTime'),
                        verifyTime: this.calculateAverage(verifyStats, 'verifyTime'),
                        totalOperations: user.stats.length,
                        errorRate: user.stats.length > 0 ? errorStats.length / user.stats.length : 0
                    };
                });
        } catch (error) {
            console.error('Error collecting user statistics:', error);
            return [];
        }
    }

    calculateAverage(stats, property) {
        if (!Array.isArray(stats) || stats.length === 0) return 0;
        return stats.reduce((sum, stat) => sum + (stat[property] || 0), 0) / stats.length;
    }

    calculateArrayAverage(array) {
        if (!Array.isArray(array) || array.length === 0) return 0;
        return array.reduce((sum, val) => sum + (val || 0), 0) / array.length;
    }

    calculateGiniCoefficient(values) {
        if (!Array.isArray(values) || values.length <= 1) return 0;

        const sortedValues = [...values].sort((a, b) => a - b);
        const n = sortedValues.length;

        let sumOfDifferences = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                sumOfDifferences += Math.abs(sortedValues[i] - sortedValues[j]);
            }
        }

        const mean = this.calculateArrayAverage(sortedValues);
        if (mean === 0) return 0;

        return sumOfDifferences / (2 * n * n * mean);
    }

    trackCryptoSizes(users) {
        if (!Array.isArray(users) || users.length === 0) return;
        
        try {
            // Get the first user with crypto data
            const user = users.find(u => u && u.kemKeys && u.signKeys);
            if (!user) return;
            
            // Track the scheme
            this.cryptoSizes.scheme = user.cryptoScheme || 'N/A';
            
            // Track key sizes
            if (user.kemKeys) {
                const kemPublicSize = this.estimateKeySize(user.kemKeys.publicKey);
                const kemPrivateSize = this.estimateKeySize(user.kemKeys.secretKey);
                
                this.cryptoSizes.keyPairs.kem.publicKeySize = kemPublicSize;
                this.cryptoSizes.keyPairs.kem.privateKeySize = kemPrivateSize;
            }
            
            if (user.signKeys) {
                const signPublicSize = this.estimateKeySize(user.signKeys.publicKey);
                const signPrivateSize = this.estimateKeySize(user.signKeys.secretKey);
                
                this.cryptoSizes.keyPairs.signature.publicKeySize = signPublicSize;
                this.cryptoSizes.keyPairs.signature.privateKeySize = signPrivateSize;
            }
            
            // Track message sizes
            const messageSizes = this.collectMessageSizes(users);
            this.cryptoSizes.messages.ciphertextSize = messageSizes.avgCiphertextSize;
            this.cryptoSizes.messages.signatureSize = messageSizes.avgSignatureSize;
            
            // Count of users in the simulation
            this.cryptoSizes.count = users.length;
            
            // Average operation times
            const cryptoPerformance = this.calculateCryptoPerformanceMetrics();
            this.cryptoSizes.averageTime = {
                encrypt: cryptoPerformance.averageEncryptTime,
                decrypt: cryptoPerformance.averageDecryptTime,
                sign: cryptoPerformance.averageSignTime,
                verify: cryptoPerformance.averageVerifyTime
            };
            
        } catch (error) {
            console.error('Error tracking crypto sizes:', error);
        }
    }
    
    estimateKeySize(keyData) {
        if (!keyData) return 0;
        
        try {
            // If it's a base64 string
            if (typeof keyData === 'string') {
                // Base64 encodes 3 bytes into 4 chars
                // We need to estimate the actual binary size
                const padding = keyData.endsWith('==') ? 2 : keyData.endsWith('=') ? 1 : 0;
                return Math.floor((keyData.length * 3) / 4) - padding;
            }
            
            // If it's a Uint8Array or similar
            if (keyData.BYTES_PER_ELEMENT && keyData.length) {
                return keyData.length * keyData.BYTES_PER_ELEMENT;
            }
            
            // If it's an array
            if (Array.isArray(keyData)) {
                return keyData.length;
            }
            
            // If it's an object 
            if (typeof keyData === 'object') {
                const json = JSON.stringify(keyData);
                return json.length;
            }
            
            return 0;
        } catch (error) {
            console.error('Error estimating key size:', error);
            return 0;
        }
    }
    
    collectMessageSizes(users) {
        let totalCiphertextSize = 0;
        let ciphertextCount = 0;
        let totalSignatureSize = 0;
        let signatureCount = 0;
        
        users.forEach(user => {
            if (!user.stats || !Array.isArray(user.stats)) return;
            
            user.stats.forEach(stat => {
                if (stat && stat.encryptedSize) {
                    totalCiphertextSize += stat.encryptedSize;
                    ciphertextCount++;
                }
                if (stat && stat.signatureSize) {
                    totalSignatureSize += stat.signatureSize;
                    signatureCount++;
                }
            });
        });
        
        return {
            avgCiphertextSize: ciphertextCount > 0 ? Math.round(totalCiphertextSize / ciphertextCount) : 0,
            avgSignatureSize: signatureCount > 0 ? Math.round(totalSignatureSize / signatureCount) : 0
        };
    }

    exportToJSON() {
        try {
            const data = {
                metadata: {
                    timestamp: this.simulationTimestamp?.toISOString() || new Date().toISOString(),
                    distributionUsed: this.distributionUsed,
                    executionTime: this.executionTime
                },
                documentStats: this.documentStats,
                userStats: this.userStats,
                cryptoSizes: this.cryptoSizes,
                summary: this.generateSummary()
            };
            return JSON.stringify(data, null, 2);
        } catch (error) {
            console.error('Error exporting analytics to JSON:', error);
            return JSON.stringify({
                error: 'Failed to export analytics data',
                message: error.message
            });
        }
    }

    generateSummary() {
        try {
            const totalEdits = this.documentStats.reduce((sum, doc) => sum + doc.totalEdits, 0);
            const sortedByEdits = [...this.documentStats].sort((a, b) => b.totalEdits - a.totalEdits);

            const editValues = this.documentStats.map(doc => doc.totalEdits);
            const giniCoefficient = this.calculateGiniCoefficient(editValues);

            const top20Percent = Math.max(1, Math.ceil(sortedByEdits.length * 0.2));
            const top20PercentEdits = sortedByEdits.slice(0, top20Percent)
                .reduce((sum, doc) => sum + doc.totalEdits, 0);
            const paretoRatio = totalEdits > 0 ? (top20PercentEdits / totalEdits) * 100 : 0;

            const distributionAnalysis = this.createDistributionAnalysisText(
                giniCoefficient,
                paretoRatio
            );

            const mostEditedDoc = sortedByEdits.length > 0 ? sortedByEdits[0] : { id: 'none', totalEdits: 0 };
            const leastEditedDoc = sortedByEdits.length > 0 ?
                sortedByEdits[sortedByEdits.length - 1] : { id: 'none', totalEdits: 0 };

            const cryptoPerformance = this.calculateCryptoPerformanceMetrics();

            return {
                totalDocuments: this.documentStats.length,
                totalEdits: totalEdits,
                averageEditsPerDocument: this.documentStats.length > 0 ?
                    totalEdits / this.documentStats.length : 0,
                distributionAnalysis: distributionAnalysis,
                giniCoefficient: giniCoefficient,
                paretoRatio: paretoRatio,
                mostEditedDocument: {
                    id: mostEditedDoc.id,
                    totalEdits: mostEditedDoc.totalEdits,
                    editorCount: mostEditedDoc.editorCount
                },
                leastEditedDocument: {
                    id: leastEditedDoc.id,
                    totalEdits: leastEditedDoc.totalEdits,
                    editorCount: leastEditedDoc.editorCount
                },
                cryptoPerformance: cryptoPerformance
            };
        } catch (error) {
            console.error('Error generating summary:', error);
            return {
                error: 'Failed to generate summary',
                message: error.message
            };
        }
    }

    createDistributionAnalysisText(giniCoefficient, paretoRatio) {
        if (!this.distributionUsed) {
            return "No statistical distributions used in simulation";
        }

        let analysis = `Distribution analysis: Gini coefficient = ${giniCoefficient.toFixed(2)} `;

        if (giniCoefficient > 0.6) {
            analysis += "(High inequality in edit distribution). ";
        } else if (giniCoefficient > 0.3) {
            analysis += "(Moderate inequality in edit distribution). ";
        } else {
            analysis += "(Low inequality in edit distribution). ";
        }

        analysis += `Top 20% of documents have ${paretoRatio.toFixed(0)}% of all edits.`;

        if (paretoRatio > 80) {
            analysis += " This follows the Pareto principle strongly.";
        }

        return analysis;
    }

    calculateCryptoPerformanceMetrics() {
        return {
            averageEncryptTime: this.calculateArrayAverage(this.userStats.map(u => u.encryptTime)),
            averageSignTime: this.calculateArrayAverage(this.userStats.map(u => u.signTime)),
            averageDecryptTime: this.calculateArrayAverage(this.userStats.map(u => u.decryptTime)),
            averageVerifyTime: this.calculateArrayAverage(this.userStats.map(u => u.verifyTime)),
            averageErrorRate: this.calculateArrayAverage(this.userStats.map(u => u.errorRate))
        };
    }

    downloadAsJSON() {
        try {
            const jsonData = this.exportToJSON();
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `simulation-analysis-${new Date().toISOString()
                .slice(0, 19).replace(/:/g, '-')}.json`;
            a.click();

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);
        } catch (error) {
            console.error('Error downloading JSON:', error);
            alert('Failed to download analytics data. See console for details.');
        }
    }

    setExecutionTime(milliseconds) {
        this.executionTime = milliseconds;
    }

}
