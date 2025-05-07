import { runSimulation } from './simulation/Simulation.js';
import { ChartRenderer } from './visualization/ChartRenderer.js';
import { ENCRYPTOR_TYPES } from './utils/cryptoProvider.js';

class SimulationApp {
    constructor() {
        this.form = document.getElementById('simulation-form');
        this.startButton = document.getElementById('startButton');
        this.resetButton = document.getElementById('resetButton');
        this.logElement = document.getElementById('simulation-log');
        this.resultsElement = document.getElementById('results');
        this.statusIndicator = document.getElementById('status-indicator');
        this.cryptoSchemeSelect = document.getElementById('cryptoScheme');
        this.pqcOptionsContainer = document.getElementById('pqc-options');

        this.isRunning = false;
        this.simulationCount = 0;

        this.setupEventListeners();

        this.togglePqcOptions();
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.resetButton.addEventListener('click', () => this.resetResults());
        this.cryptoSchemeSelect.addEventListener('change', () => this.togglePqcOptions());

        const inputs = this.form.querySelectorAll('input[type="number"]');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.validateInput(input));
        });
    }
    
    togglePqcOptions() {
        const showPqcOptions = this.cryptoSchemeSelect.value === 'pqc';
        this.pqcOptionsContainer.style.display = showPqcOptions ? 'block' : 'none';
    }

    validateInput(input) {
        const value = parseInt(input.value);
        const min = parseInt(input.min);
        const max = parseInt(input.max);

        if (isNaN(value) || value < min || value > max) {
            input.setCustomValidity(`Value must be between ${min} and ${max}`);
        } else {
            input.setCustomValidity('');
        }
    }

    renderVisualizations(analysisData) {
        // Create container for visualizations
        const vizContainer = document.createElement('div');
        vizContainer.className = 'visualization-container';

        // Create section for JSON download
        const downloadSection = document.createElement('div');
        downloadSection.className = 'download-section';

        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download Complete Data (JSON)';
        downloadButton.className = 'primary-button download-json';
        downloadButton.addEventListener('click', () => {
            const jsonString = JSON.stringify(analysisData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'simulation-analysis.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        downloadSection.appendChild(downloadButton);
        vizContainer.appendChild(downloadSection);

        // Create sections for each chart
        const charts = [
            { id: 'edit-distribution', title: 'Edit Distribution Curve', renderer: 'renderEditDistribution' },
            { id: 'user-document-network', title: 'User-Document Network Graph', renderer: 'renderUserDocumentNetwork' },
            { id: 'performance-over-time', title: 'Performance Over Simulation Time', renderer: 'renderPerformanceOverTime' }
        ];

        charts.forEach(chart => {
            const section = document.createElement('section');
            section.className = 'chart-section';

            const heading = document.createElement('h3');
            heading.textContent = chart.title;

            const chartContainer = document.createElement('div');
            chartContainer.id = chart.id;
            chartContainer.className = 'chart-container';

            section.appendChild(heading);
            section.appendChild(chartContainer);
            vizContainer.appendChild(section);
        });

        this.resultsElement.appendChild(vizContainer);

        // Initialize the chart renderer and render all charts
        const chartRenderer = new ChartRenderer(analysisData);
        charts.forEach(chart => {
            chartRenderer[chart.renderer](chart.id);
        });
    }

    async handleSubmit(event) {
        event.preventDefault();

        if (this.isRunning) return;

        try {
            this.isRunning = true;
            this.simulationCount++;
            this.updateUIState('running');

            const params = this.getSimulationParameters();
            this.log(`Using crypto scheme: ${params.cryptoScheme}`, 'info');
            const startTime = performance.now();

            if (this.resultsElement.children.length === 0) {
                this.resetLog();
            }

            const result = await runSimulation(params);

            const executionTime = performance.now() - startTime;

            if (result && result.analytics) {
                result.analytics.setExecutionTime(executionTime);
                this.renderVisualizations(result.analytics);
                this.log(`Simulation completed in ${(executionTime / 1000).toFixed(2)} seconds`);
            }

            this.updateUIState('completed');
        } catch (error) {
            console.error('Simulation error:', error);
            this.log(`Error: ${error.message}`, 'error');
            this.updateUIState('error');
        } finally {
            this.isRunning = false;
        }
    }

    getSimulationParameters() {
        const encryptorType = document.getElementById('encryptorType').value;
        console.log(`Using encryptor type: ${encryptorType}`);
        
        const params = {
            numUsers: parseInt(document.getElementById('numUsers').value, 10),
            numDocuments: parseInt(document.getElementById('numDocuments').value, 10),
            maxEditsPerUser: parseInt(document.getElementById('maxEditsPerUser').value, 10),
            logFrequency: parseInt(document.getElementById('logFrequency').value, 10),
            useDistribution: document.getElementById('useDistribution').checked,
            cryptoScheme: document.getElementById('cryptoScheme').value,
            encryptorType: encryptorType
        };

        if (params.cryptoScheme === 'pqc') {
            params.kem = document.getElementById('kemScheme').value;
            params.signature = document.getElementById('signatureScheme').value;
        }
        
        return params;
    }

    updateUIState(state) {
        this.startButton.disabled = (state === 'running');
        this.resetButton.disabled = (state === 'running');

        switch (state) {
            case 'running':
                this.startButton.textContent = 'Running...';
                break;
            case 'completed':
                this.startButton.textContent = 'Run Again';
                break;
            case 'error':
                this.startButton.textContent = 'Try Again';
                break;
            default:
                this.startButton.textContent = 'Start Simulation';
        }

        this.statusIndicator.textContent = state.charAt(0).toUpperCase() + state.slice(1);
        this.statusIndicator.className = 'status-indicator ' + state;

        if (state === 'running') {
            this.logElement.classList.add('running-animation');
        } else {
            this.logElement.classList.remove('running-animation');
        }
    }

    log(message, type = 'info') {
        if (!this.logElement) return;

        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;

        const messageEl = document.createElement('div');
        messageEl.innerHTML = formattedMessage;

        if (type === 'error') {
            messageEl.style.color = 'var(--danger)';
        } else if (type === 'success') {
            messageEl.style.color = 'var(--success)';
        }

        this.logElement.appendChild(messageEl);
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    resetLog() {
        if (this.logElement) {
            this.logElement.innerHTML = '';
        }
    }

    resetResults() {
        if (this.resultsElement) {
            this.resultsElement.innerHTML = '';
        }

        this.resetLog();
        this.log('Results cleared. Ready for a new simulation.');
        this.updateUIState('ready');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new SimulationApp();
});

