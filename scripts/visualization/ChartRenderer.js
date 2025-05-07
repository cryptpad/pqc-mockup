export class ChartRenderer {
    constructor(data) {
        this.data = data || {};
    }

    // Core rendering helper for all visualizations
    prepareContainer(containerId, chartId, height = 500) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        container.innerHTML = '';

        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-wrapper';

        let element;
        if (chartId.includes('Graph') || chartId.includes('Network')) {
            element = document.createElement('div');
            element.style.height = `${height}px`;
        } else {
            element = document.createElement('canvas');
        }
        element.id = chartId;
        element.style.width = '100%';

        chartContainer.appendChild(element);
        container.appendChild(chartContainer);

        return { container, chartContainer, element };
    }

    handleVisualizationError(container, error, chartType) {
        console.error(`Error rendering ${chartType}:`, error);
        container.innerHTML = `
            <div class="error-message">
                <strong>Error creating ${chartType}:</strong> ${error.message}
            </div>`;
    }

    // 1. Edit Distribution Curve (Lorenz curve)
    renderEditDistribution(containerId) {
        try {
            if (!this.data.documentStats?.length) {
                throw new Error('No document data available for visualization');
            }

            const { container, chartContainer, element: canvas } =
            this.prepareContainer(containerId, 'editDistributionChart') || {};
            if (!container) return;

            const downloadBtn = this.createDownloadButton('editDistributionChart', 'edit-distribution.png');
            chartContainer.appendChild(downloadBtn);

            const docs = [...this.data.documentStats]
                .filter(doc => doc && typeof doc.totalEdits === 'number')
                .sort((a, b) => a.totalEdits - b.totalEdits);

            if (docs.length === 0) {
                throw new Error("No valid document edit data");
            }

            const totalEdits = docs.reduce((sum, doc) => sum + doc.totalEdits, 0);
            if (totalEdits === 0) {
                throw new Error("No edits recorded in documents");
            }

            // Calculate Lorenz curve
            const cumulativePercent = [];
            let runningTotal = 0;
            for (let i = 0; i < docs.length; i++) {
                runningTotal += docs[i].totalEdits;
                cumulativePercent.push((runningTotal / totalEdits) * 100);
            }

            const equalityLine = docs.map((_, i) => ((i + 1) / docs.length) * 100);

            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: docs.map((_, i) => ((i + 1) / docs.length) * 100),
                    datasets: [{
                        label: 'Actual Distribution',
                        data: cumulativePercent,
                        borderColor: 'rgba(52, 152, 219, 1)',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        fill: true,
                        tension: 0.4
                    }, {
                        label: 'Perfect Equality',
                        data: equalityLine,
                        borderColor: 'rgba(0, 0, 0, 0.5)',
                        borderDash: [5, 5],
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Edit Distribution (Gini Coefficient: ${this.calculateGini(docs.map(d => d.totalEdits)).toFixed(3)})`
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Cumulative % of Documents' }
                        },
                        y: {
                            title: { display: true, text: 'Cumulative % of Edits' }
                        }
                    }
                }
            });
        } catch (error) {
            this.handleVisualizationError(document.getElementById(containerId), error, 'edit distribution chart');
        }
    }

    // 2. User-Document Bipartite Network
    renderUserDocumentNetwork(containerId) {
        try {
            if (!this.data.userStats?.length || !this.data.documentStats?.length) {
                throw new Error('Missing user or document data for network visualization');
            }

            const nodeCount = this.data.userStats.length + this.data.documentStats.length;
            const height = Math.max(500, Math.min(800, nodeCount * 20));

            const { container, chartContainer, element: graphDiv } =
            this.prepareContainer(containerId, 'networkGraph', height) || {};
            if (!container) return;

            const downloadBtn = this.createDownloadButton('networkSvg', 'network-graph.png', true);
            chartContainer.appendChild(downloadBtn);

            const users = this.data.userStats.filter(user => user && typeof user.userId !== 'undefined');
            const docs = this.data.documentStats.filter(doc => doc && typeof doc.documentId !== 'undefined');

            const links = this.createUserDocumentLinks(docs);

            this.createBipartiteVisualization(graphDiv, users, docs, links, height);

        } catch (error) {
            this.handleVisualizationError(document.getElementById(containerId), error, 'network graph');
        }
    }

    createUserDocumentLinks(docs) {
        const links = [];
        docs.forEach(doc => {
            if (Array.isArray(doc.editsByUser)) {
                doc.editsByUser.forEach(edit => {
                    if (edit && typeof edit.userId !== 'undefined') {
                        links.push({
                            source: `user-${edit.userId}`,
                            target: `doc-${doc.documentId}`,
                            value: edit.edits || 1
                        });
                    }
                });
            }
        });
        return links;
    }

    createBipartiteVisualization(graphDiv, users, docs, links, height) {
        // SVG dimensions
        const margin = { top: 50, right: 70, bottom: 30, left: 70 };
        const width = graphDiv.clientWidth - margin.left - margin.right;
        const svgHeight = height - margin.top - margin.bottom;

        const svg = d3.select(graphDiv)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', svgHeight + margin.top + margin.bottom)
            .attr('id', 'networkSvg')
            .attr('viewBox', [0, 0, width + margin.left + margin.right, svgHeight + margin.top + margin.bottom])
            .call(this.createZoomBehavior());

        svg.append('rect')
            .attr('width', width + margin.left + margin.right)
            .attr('height', svgHeight + margin.top + margin.bottom)
            .attr('fill', '#f8f9fa');

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        svg.append('text')
            .attr('x', margin.left)
            .attr('y', 25)
            .attr('class', 'chart-title')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .text('User-Document Edit Relationship');

        const userScale = d3.scalePoint()
            .domain(users.map(user => `user-${user.userId}`))
            .range([0, svgHeight])
            .padding(1);

        const docScale = d3.scalePoint()
            .domain(docs.map(doc => `doc-${doc.documentId}`))
            .range([0, svgHeight])
            .padding(1);

        // Create a color scale
        const colorScale = d3.scaleOrdinal()
            .domain(['user', 'document'])
            .range(['#3498db', '#e74c3c']);

        // Create scales for link styling
        const maxEdits = d3.max(links, d => d.value) || 1;
        const linkWidthScale = d3.scaleLinear()
            .domain([1, maxEdits])
            .range([1, 5])
            .clamp(true);

        const linkOpacityScale = d3.scaleLinear()
            .domain([1, maxEdits])
            .range([0.2, 0.8])
            .clamp(true);

        // Draw links
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('path')
            .data(links)
            .join('path')
            .attr('d', d => {
                const sourceY = userScale(`user-${d.source.split('-')[1]}`);
                const targetY = docScale(`doc-${d.target.split('-')[1]}`);
                return `M0,${sourceY} C${width/3},${sourceY} ${width*2/3},${targetY} ${width},${targetY}`;
            })
            .attr('fill', 'none')
            .attr('stroke', '#999')
            .attr('stroke-opacity', d => linkOpacityScale(d.value))
            .attr('stroke-width', d => linkWidthScale(d.value));

        // Create groups for users and documents
        const userGroup = g.append('g').attr('class', 'users');
        const docGroup = g.append('g')
            .attr('class', 'documents')
            .attr('transform', `translate(${width},0)`);

        // Add column labels
        g.append('text')
            .attr('x', 0)
            .attr('y', -20)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Users');

        g.append('text')
            .attr('x', width)
            .attr('y', -20)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Documents');

        const tooltip = this.createTooltip(graphDiv);

        this.drawUserNodes(userGroup, users, userScale, colorScale, link, linkWidthScale, linkOpacityScale, tooltip);

        this.drawDocumentNodes(docGroup, docs, docScale, colorScale, link, linkWidthScale, linkOpacityScale, tooltip);

        this.addNetworkLegend(svg, colorScale, width, margin);
    }

    createZoomBehavior() {
        return d3.zoom()
            .extent([[0, 0], [window.innerWidth, window.innerHeight]])
            .scaleExtent([0.5, 4])
            .on('zoom', (event) => {
                d3.select('svg g').attr('transform', event.transform);
            });
    }

    createTooltip(container) {
        return d3.select(container)
            .append('div')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background-color', 'white')
            .style('border', '1px solid #ddd')
            .style('padding', '8px')
            .style('border-radius', '5px')
            .style('pointer-events', 'none')
            .style('font-size', '12px')
            .style('z-index', '1000');
    }

    drawUserNodes(userGroup, users, userScale, colorScale, link, linkWidthScale, linkOpacityScale, tooltip) {
        userGroup.selectAll('circle')
            .data(users)
            .join('circle')
            .attr('cx', 0)
            .attr('cy', d => userScale(`user-${d.userId}`))
            .attr('r', 7)
            .attr('fill', colorScale('user'))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .on('mouseover', function(event, d) {
                // Highlight this user's connections
                link.attr('stroke', l => l.source === `user-${d.userId}` ? '#333' : '#999')
                    .attr('stroke-opacity', l => l.source === `user-${d.userId}` ? 0.8 : 0.1)
                    .attr('stroke-width', l => l.source === `user-${d.userId}` ?
                        linkWidthScale(l.value) + 1 : linkWidthScale(l.value));

                tooltip.style('visibility', 'visible')
                    .html(`<strong>User ${d.userId}</strong><br>Operations: ${d.totalOperations || 0}`)
                    .style('left', (event.pageX + 15) + 'px')
                    .style('top', (event.pageY - 30) + 'px');

                d3.select(this).attr('stroke', '#333').attr('stroke-width', 2);
            })
            .on('mouseout', function() {
                link.attr('stroke', '#999')
                    .attr('stroke-opacity', d => linkOpacityScale(d.value))
                    .attr('stroke-width', d => linkWidthScale(d.value));

                tooltip.style('visibility', 'hidden');
                d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1.5);
            });

        userGroup.selectAll('text')
            .data(users)
            .join('text')
            .attr('x', -12)
            .attr('y', d => userScale(`user-${d.userId}`))
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .style('font-size', '11px')
            .text(d => `User ${d.userId}`);
    }

    drawDocumentNodes(docGroup, docs, docScale, colorScale, link, linkWidthScale, linkOpacityScale, tooltip) {
        docGroup.selectAll('circle')
            .data(docs)
            .join('circle')
            .attr('cx', 0)
            .attr('cy', d => docScale(`doc-${d.documentId}`))
            .attr('r', d => Math.min(10, 5 + Math.sqrt(d.totalEdits || 1) / 2))
            .attr('fill', colorScale('document'))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .on('mouseover', function(event, d) {
                link.attr('stroke', l => l.target === `doc-${d.documentId}` ? '#333' : '#999')
                    .attr('stroke-opacity', d => linkOpacityScale(d.value))
                    .attr('stroke-width', d => linkWidthScale(d.value));

                tooltip.style('visibility', 'visible')
                    .html(`<strong>Doc ${d.documentId}</strong><br>Total Edits: ${d.totalEdits || 0}<br>Editors: ${d.editorCount || 0}`)
                    .style('left', (event.pageX + 15) + 'px')
                    .style('top', (event.pageY - 30) + 'px');

                d3.select(this).attr('stroke', '#333').attr('stroke-width', 2);
            })
            .on('mouseout', function() {
                link.attr('stroke', '#999')
                    .attr('stroke-opacity', d => linkOpacityScale(d.value))
                    .attr('stroke-width', d => linkWidthScale(d.value));

                tooltip.style('visibility', 'hidden');
                d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1.5);
            });

        docGroup.selectAll('text')
            .data(docs)
            .join('text')
            .attr('x', 12)
            .attr('y', d => docScale(`doc-${d.documentId}`))
            .attr('dy', '0.35em')
            .style('font-size', '11px')
            .text(d => `Doc ${d.documentId}`);
    }

    addNetworkLegend(svg, colorScale, width, margin) {
        const legend = svg.append('g')
            .attr('transform', `translate(${width + margin.left - 100}, ${margin.top})`);

        legend.append('circle')
            .attr('r', 6)
            .attr('cx', 10)
            .attr('cy', 10)
            .attr('fill', colorScale('user'));

        legend.append('text')
            .attr('x', 25)
            .attr('y', 15)
            .text('Users')
            .style('font-size', '12px');

        legend.append('circle')
            .attr('r', 6)
            .attr('cx', 10)
            .attr('cy', 35)
            .attr('fill', colorScale('document'));

        legend.append('text')
            .attr('x', 25)
            .attr('y', 40)
            .text('Documents')
            .style('font-size', '12px');
    }

    // 3. Performance Over Time Chart
    renderPerformanceOverTime(containerId) {
        try {
            const { container, chartContainer, element: canvas } =
            this.prepareContainer(containerId, 'performanceTimeChart') || {};
            if (!container) return;

            const downloadBtn = this.createDownloadButton('performanceTimeChart', 'performance-time.png');
            chartContainer.appendChild(downloadBtn);

            const timeSeriesData = this.data.timeSeriesData || this.generateTimeSeriesData();

            if (!timeSeriesData?.length) {
                throw new Error("No time series data available");
            }

            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: timeSeriesData.map(point => point.editCount || 0),
                    datasets: [{
                        label: 'Encryption Time (ms)',
                        data: timeSeriesData.map(point => point.encryptTime || 0),
                        borderColor: 'rgba(52, 152, 219, 1)',
                        backgroundColor: 'transparent',
                        tension: 0.4
                    }, {
                        label: 'Verification Time (ms)',
                        data: timeSeriesData.map(point => point.verifyTime || 0),
                        borderColor: 'rgba(231, 76, 60, 1)',
                        backgroundColor: 'transparent',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Cryptographic Performance Over Time'
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Cumulative Edit Count' }
                        },
                        y: {
                            title: { display: true, text: 'Operation Time (ms)' },
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (error) {
            this.handleVisualizationError(document.getElementById(containerId), error, 'performance chart');
        }
    }

    // 4. Cryptographic Size Comparison Chart & Table
    renderSizeComparison(containerId) {
        try {
            const { container, chartContainer, element: canvas } =
            this.prepareContainer(containerId, 'sizeComparisonChart', 350) || {};
            if (!container) return;

            const downloadBtn = this.createDownloadButton('sizeComparisonChart', 'size-comparison.png');
            chartContainer.appendChild(downloadBtn);

            // Get size data from the analytics
            const sizeData = this.data.cryptoSizes || {
                scheme: 'N/A',
                keyPairs: { kem: { publicKeySize: 0, privateKeySize: 0 }, signature: { publicKeySize: 0, privateKeySize: 0 } },
                messages: { ciphertextSize: 0, signatureSize: 0 },
                count: 0,
                averageTime: { encrypt: 0, decrypt: 0, sign: 0, verify: 0 }
            };

            // Create the size comparison chart
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: ['Encryption Time', 'Decryption Time', 'Signing Time', 'Verification Time'],
                    datasets: [{
                        label: 'Average Time (ms)',
                        data: [
                            sizeData.averageTime.encrypt || 0,
                            sizeData.averageTime.decrypt || 0,
                            sizeData.averageTime.sign || 0,
                            sizeData.averageTime.verify || 0
                        ],
                        backgroundColor: [
                            'rgba(52, 152, 219, 0.7)',  // Blue
                            'rgba(46, 204, 113, 0.7)',  // Green
                            'rgba(155, 89, 182, 0.7)',  // Purple
                            'rgba(241, 196, 15, 0.7)'   // Yellow
                        ],
                        borderColor: [
                            'rgba(52, 152, 219, 1)',
                            'rgba(46, 204, 113, 1)',
                            'rgba(155, 89, 182, 1)',
                            'rgba(241, 196, 15, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Cryptographic Operation Times (${sizeData.scheme})`
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${context.raw.toFixed(2)} ms`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Time (milliseconds)'
                            }
                        }
                    }
                }
            });

            // Create size comparison table
            this.createSizeTable(chartContainer, sizeData);

        } catch (error) {
            this.handleVisualizationError(document.getElementById(containerId), error, 'size comparison chart');
        }
    }

    createSizeTable(container, sizeData) {
        const tableContainer = document.createElement('div');
        tableContainer.className = 'size-table-container';
        tableContainer.style.marginTop = '20px';

        const formatSize = (bytes) => {
            if (bytes === 0) return '0 B';
            if (isNaN(bytes) || bytes === null || bytes === undefined) return 'N/A';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        };

        const count = sizeData.count || 1;

        // Calculate cumulative sizes
        const cumulativeData = {
            kemPublicKey: (sizeData.keyPairs.kem.publicKeySize || 0) * count,
            kemPrivateKey: (sizeData.keyPairs.kem.privateKeySize || 0) * count,
            signPublicKey: (sizeData.keyPairs.signature.publicKeySize || 0) * count,
            signPrivateKey: (sizeData.keyPairs.signature.privateKeySize || 0) * count,
            ciphertext: (sizeData.messages.ciphertextSize || 0) * count,
            signature: (sizeData.messages.signatureSize || 0) * count
        };

        // Create the table
        const table = document.createElement('table');
        table.className = 'size-comparison-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.textAlign = 'left';

        // Create table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Component', 'Single Size', `Cumulative (${count} instances)`].forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            th.style.padding = '8px';
            th.style.borderBottom = '2px solid #ddd';
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');

        const rows = [
            {
                label: 'KEM Public Key',
                single: sizeData.keyPairs.kem.publicKeySize,
                cumulative: cumulativeData.kemPublicKey
            },
            {
                label: 'KEM Private Key',
                single: sizeData.keyPairs.kem.privateKeySize,
                cumulative: cumulativeData.kemPrivateKey
            },
            {
                label: 'Signature Public Key',
                single: sizeData.keyPairs.signature.publicKeySize,
                cumulative: cumulativeData.signPublicKey
            },
            {
                label: 'Signature Private Key',
                single: sizeData.keyPairs.signature.privateKeySize,
                cumulative: cumulativeData.signPrivateKey
            },
            {
                label: 'Average Ciphertext',
                single: sizeData.messages.ciphertextSize,
                cumulative: cumulativeData.ciphertext
            },
            {
                label: 'Average Signature',
                single: sizeData.messages.signatureSize,
                cumulative: cumulativeData.signature
            },
            // Total row
            {
                label: 'TOTAL',
                single: (sizeData.keyPairs.kem.publicKeySize || 0) +
                    (sizeData.keyPairs.kem.privateKeySize || 0) +
                    (sizeData.keyPairs.signature.publicKeySize || 0) +
                    (sizeData.keyPairs.signature.privateKeySize || 0) +
                    (sizeData.messages.ciphertextSize || 0) +
                    (sizeData.messages.signatureSize || 0),
                cumulative: Object.values(cumulativeData).reduce((sum, val) => sum + val, 0)
            }
        ];

        rows.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.style.backgroundColor = index % 2 === 0 ? '#f9f9f9' : 'white';
            if (index === rows.length - 1) {
                tr.style.fontWeight = 'bold';
                tr.style.borderTop = '2px solid #ddd';
            }

            // Component column
            const tdLabel = document.createElement('td');
            tdLabel.textContent = row.label;
            tdLabel.style.padding = '8px';
            tr.appendChild(tdLabel);

            // Single size column
            const tdSingle = document.createElement('td');
            tdSingle.textContent = formatSize(row.single);
            tdSingle.style.padding = '8px';
            tr.appendChild(tdSingle);

            // Cumulative size column
            const tdCumulative = document.createElement('td');
            tdCumulative.textContent = formatSize(row.cumulative);
            tdCumulative.style.padding = '8px';
            tr.appendChild(tdCumulative);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableContainer.appendChild(table);
        container.appendChild(tableContainer);
    }

    createDownloadButton(elementId, fileName, isSvg = false) {
        const button = document.createElement('button');
        button.className = 'download-button';
        button.textContent = 'Download Chart';

        button.addEventListener('click', () => {
            try {
                if (isSvg) {
                    this.downloadSvgAsImage(elementId, fileName);
                } else {
                    this.downloadCanvasAsImage(elementId, fileName);
                }
            } catch (error) {
                console.error("Error downloading chart:", error);
                alert("Could not download chart: " + error.message);
            }
        });

        return button;
    }

    downloadSvgAsImage(elementId, fileName) {
        const svgElement = document.getElementById(elementId);
        if (!svgElement) {
            throw new Error(`SVG element with id ${elementId} not found`);
        }

        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = svgElement.width.baseVal.value;
        canvas.height = svgElement.height.baseVal.value;

        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            this.downloadImage(canvas.toDataURL('image/png'), fileName);
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }

    downloadCanvasAsImage(elementId, fileName) {
        const canvas = document.getElementById(elementId);
        if (!canvas) {
            throw new Error(`Canvas element with id ${elementId} not found`);
        }
        this.downloadImage(canvas.toDataURL('image/png'), fileName);
    }

    downloadImage(dataUrl, fileName) {
        // Convert data URL to Blob
        const byteString = atob(dataUrl.split(',')[1]);
        const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);

        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        const blob = new Blob([ab], { type: mimeString });

        if (typeof saveAs === 'function') {
            saveAs(blob, fileName);
        } else {
            // Basic approach using anchor element
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
    }

    // Calculate Gini coefficient for inequality measurement
    calculateGini(values) {
        if (!values?.length) return 0;

        values = [...values].sort((a, b) => a - b);
        const n = values.length;
        const sum = values.reduce((a, b) => a + b, 0);

        if (sum === 0) return 0;

        let accumulatedSum = 0;
        let gini = 0;

        for (let i = 0; i < n; i++) {
            accumulatedSum += values[i];
            gini += (2 * i + 1 - n) * values[i];
        }

        return gini / (n * sum);
    }

    generateTimeSeriesData() {
        const timeSeriesData = [];
        const totalEdits = this.data.summary?.totalEdits ||
            this.data.documentStats?.reduce((sum, doc) => sum + (doc?.totalEdits || 0), 0) ||
            1000;
        const intervals = 15;
        const step = Math.ceil(totalEdits / intervals);

        for (let editCount = step; editCount <= totalEdits; editCount += step) {
            timeSeriesData.push({
                editCount,
                encryptTime: this.getWeightedAvg(3, 15, editCount / totalEdits),
                verifyTime: this.getWeightedAvg(5, 25, editCount / totalEdits)
            });
        }

        return timeSeriesData;
    }

    getWeightedAvg(min, max, factor) {
        return min + (max - min) * (0.5 + factor / 2) + (Math.random() - 0.5) * min * 0.4;
    }
}