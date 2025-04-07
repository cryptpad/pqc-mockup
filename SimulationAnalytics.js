// Create a new file named SimulationAnalytics.js
export class SimulationAnalytics {
    constructor() {
        this.documentStats = [];
        this.userStats = [];
        this.distributionUsed = false;
    }

    trackSimulation(users, documents, useDistribution) {
        this.distributionUsed = useDistribution;

        this.documentStats = documents.map(doc => ({
            id: doc.id,
            editorCount: doc.editors.size,
            totalEdits: doc.edits,
            editorsIds: [...doc.editors]
        }));

        this.userStats = users
            .filter(user => user.stats.length > 0)
            .map(user => {
                const encryptStats = user.stats.filter(s => s.encryptTime > 0);
                const signStats = user.stats.filter(s => s.signTime > 0);
                const decryptStats = user.stats.filter(s => s.decryptTime > 0);
                const verifyStats = user.stats.filter(s => s.verifyTime > 0);

                return {
                    id: user.id,
                    encryptTime: this.calculateAverage(encryptStats, 'encryptTime'),
                    signTime: this.calculateAverage(signStats, 'signTime'),
                    decryptTime: this.calculateAverage(decryptStats, 'decryptTime'),
                    verifyTime: this.calculateAverage(verifyStats, 'verifyTime'),
                    totalOperations: user.stats.length
                };
            });
    }

    calculateAverage(stats, property) {
        return stats.length > 0 ?
            stats.reduce((sum, stat) => sum + stat[property], 0) / stats.length :
            0;
    }

    exportToJSON() {
        const data = {
            timestamp: new Date().toISOString(),
            distributionUsed: this.distributionUsed,
            documentStats: this.documentStats,
            userStats: this.userStats,
            summary: this.generateSummary()
        };

        return JSON.stringify(data, null, 2);
    }

    generateSummary() {
        const totalEdits = this.documentStats.reduce((sum, doc) => sum + doc.totalEdits, 0);
        this.documentStats.map(doc => ({
            docId: doc.id,
            averageEditsPerEditor: doc.editorCount > 0 ? doc.totalEdits / doc.editorCount : 0
        }));
        let distributionAnalysis = "No statistical distributions used";
        if (this.distributionUsed) {
            const sortedByEdits = [...this.documentStats].sort((a, b) => b.totalEdits - a.totalEdits);
            const totalEdits = sortedByEdits.reduce((sum, doc) => sum + doc.totalEdits, 0);


            let sumOfDifferences = 0;
            for (let i = 0; i < sortedByEdits.length; i++) {
                for (let j = 0; j < sortedByEdits.length; j++) {
                    sumOfDifferences += Math.abs(sortedByEdits[i].totalEdits - sortedByEdits[j].totalEdits);
                }
            }

            const giniCoefficient = totalEdits > 0 ?
                sumOfDifferences / (2 * sortedByEdits.length * sortedByEdits.length *
                    (totalEdits / sortedByEdits.length)) : 0;


            const top20Percent = Math.ceil(sortedByEdits.length * 0.2);
            const top20PercentEdits = sortedByEdits.slice(0, top20Percent)
                .reduce((sum, doc) => sum + doc.totalEdits, 0);
            const paretoRatio = totalEdits > 0 ? (top20PercentEdits / totalEdits) * 100 : 0;

            distributionAnalysis = `Distribution analysis: Gini coefficient = ${giniCoefficient.toFixed(2)} `;
            if (giniCoefficient > 0.6) {
                distributionAnalysis += "(High inequality in edit distribution). ";
            } else if (giniCoefficient > 0.3) {
                distributionAnalysis += "(Moderate inequality in edit distribution). ";
            } else {
                distributionAnalysis += "(Low inequality in edit distribution). ";
            }

            distributionAnalysis += `Top 20% of documents have ${paretoRatio.toFixed(0)}% of all edits.`;
        }

        return {
            totalDocuments: this.documentStats.length,
            totalEdits: totalEdits,
            averageEditsPerDocument: totalEdits / this.documentStats.length,
            distributionAnalysis: distributionAnalysis,
            mostEditedDocument: this.documentStats.reduce((max, doc) =>
                doc.totalEdits > max.totalEdits ? doc : max, this.documentStats[0]),
            leastEditedDocument: this.documentStats.reduce((min, doc) =>
                doc.totalEdits < min.totalEdits ? doc : min, this.documentStats[0]),
            cryptoPerformance: {
                averageEncryptTime: this.calculateArrayAverage(this.userStats.map(u => u.encryptTime)),
                averageSignTime: this.calculateArrayAverage(this.userStats.map(u => u.signTime)),
                averageDecryptTime: this.calculateArrayAverage(this.userStats.map(u => u.decryptTime)),
                averageVerifyTime: this.calculateArrayAverage(this.userStats.map(u => u.verifyTime))
            }
        };
    }

    calculateArrayAverage(array) {
        return array.length > 0 ?
            array.reduce((sum, val) => sum + val, 0) / array.length :
            0;
    }

    downloadAsJSON() {
        const jsonData = this.exportToJSON();
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation-analysis-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }
}