
        const canvas = document.getElementById('simulationCanvas');
        const ctx = canvas.getContext('2d');

        let channelMatrix = [];
        let singularValues = [];
        let beamformingVectors = { v: [], u: [] };
        let antennaConfig = {
            tx: [],
            rx: [],
            multiplexing: [],
            diversity: [],
            selectedMessage: -1
        };
        let systemState = 'initial';

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            drawAntennaSystem();
        }

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        function complexGaussian() {
            const u1 = Math.random();
            const u2 = Math.random();
            const mag = Math.sqrt(-2 * Math.log(u1));
            const phase = 2 * Math.PI * u2;
            return {
                real: mag * Math.cos(phase) / Math.sqrt(2),
                imag: mag * Math.sin(phase) / Math.sqrt(2)
            };
        }

        function generateChannelMatrix(nt, nr) {
            const H = [];
            for (let i = 0; i < nr; i++) {
                H[i] = [];
                for (let j = 0; j < nt; j++) {
                    H[i][j] = complexGaussian();
                }
            }
            return H;
        }

        function computeHHH(H) {
            const nr = H.length;
            const nt = H[0].length;
            const HHH = [];
            
            for (let i = 0; i < nr; i++) {
                HHH[i] = [];
                for (let j = 0; j < nr; j++) {
                    let sumReal = 0, sumImag = 0;
                    for (let k = 0; k < nt; k++) {
                        sumReal += H[i][k].real * H[j][k].real + H[i][k].imag * H[j][k].imag;
                        sumImag += H[i][k].imag * H[j][k].real - H[i][k].real * H[j][k].imag;
                    }
                    HHH[i][j] = { real: sumReal, imag: sumImag };
                }
            }
            return HHH;
        }

        function computeEigenvalues(HHH) {
            const n = HHH.length;
            const eigenvalues = [];
            
            for (let i = 0; i < n; i++) {
                eigenvalues.push(Math.sqrt(Math.abs(HHH[i][i].real)));
            }
            
            eigenvalues.sort((a, b) => b - a);
            return eigenvalues;
        }

        function computeBeamformingVectors(H_sub) {
            const nr = H_sub.length;
            const nt = H_sub[0].length;
            
            if (nt === 0 || nr === 0) {
                return { v: [], u: [], gain: 0 };
            }
            
            const HHH = computeHHH(H_sub);
            
            let u = new Array(nr).fill(0).map(() => ({ real: Math.random(), imag: Math.random() }));
            
            let norm = Math.sqrt(u.reduce((sum, val) => sum + val.real * val.real + val.imag * val.imag, 0));
            u = u.map(val => ({ real: val.real / norm, imag: val.imag / norm }));
            
            for (let iter = 0; iter < 20; iter++) {
                let newU = new Array(nr).fill(0).map(() => ({ real: 0, imag: 0 }));
                for (let i = 0; i < nr; i++) {
                    for (let j = 0; j < nr; j++) {
                        newU[i].real += HHH[i][j].real * u[j].real - HHH[i][j].imag * u[j].imag;
                        newU[i].imag += HHH[i][j].real * u[j].imag + HHH[i][j].imag * u[j].real;
                    }
                }
                norm = Math.sqrt(newU.reduce((sum, val) => sum + val.real * val.real + val.imag * val.imag, 0));
                u = newU.map(val => ({ real: val.real / norm, imag: val.imag / norm }));
            }
            
            let v = new Array(nt).fill(0).map(() => ({ real: 0, imag: 0 }));
            for (let j = 0; j < nt; j++) {
                for (let i = 0; i < nr; i++) {
                    v[j].real += H_sub[i][j].real * u[i].real + H_sub[i][j].imag * u[i].imag;
                    v[j].imag += H_sub[i][j].real * u[i].imag - H_sub[i][j].imag * u[i].real;
                }
            }
            
            norm = Math.sqrt(v.reduce((sum, val) => sum + val.real * val.real + val.imag * val.imag, 0));
            v = v.map(val => ({ real: val.real / norm, imag: val.imag / norm }));
            
            let gain = { real: 0, imag: 0 };
            for (let i = 0; i < nr; i++) {
                for (let j = 0; j < nt; j++) {
                    const hv_real = H_sub[i][j].real * v[j].real - H_sub[i][j].imag * v[j].imag;
                    const hv_imag = H_sub[i][j].real * v[j].imag + H_sub[i][j].imag * v[j].real;
                    gain.real += u[i].real * hv_real + u[i].imag * hv_imag;
                    gain.imag += u[i].real * hv_imag - u[i].imag * hv_real;
                }
            }
            
            const gainMagnitude = Math.sqrt(gain.real * gain.real + gain.imag * gain.imag);
            
            return { v, u, gain: gainMagnitude };
        }

        function generateTradeoffCurve(numTx, numRx, txPower, noiseVar, H) {
            const maxRank = Math.min(numTx, numRx);
            const tradeoffData = [];
            
            const HHH = computeHHH(H);
            const eigenvalues = computeEigenvalues(HHH);
            
            for (let r = 0; r <= maxRank; r++) {
                const multiplexingGain = r;
                const diversityGain = (numTx - r) * (numRx - r);
                
                let totalRate = 0;
                for (let i = 0; i < r; i++) {
                    const eigenvalueSquared = eigenvalues[i] * eigenvalues[i] * eigenvalues[i] * eigenvalues[i];
                    const snr = (eigenvalueSquared * txPower) / noiseVar;
                    totalRate += Math.log2(1 + snr);
                }
                
                let avgDiversitySNR = 0;
                if (r < maxRank) {
                    const H_sub = [];
                    for (let i = r; i < numRx; i++) {
                        H_sub[i - r] = [];
                        for (let j = r; j < numTx; j++) {
                            H_sub[i - r][j - r] = H[i][j];
                        }
                    }
                    
                    const beamforming = computeBeamformingVectors(H_sub);
                    const beamformingGainSquared = beamforming.gain * beamforming.gain;
                    const snr = (beamformingGainSquared * txPower) / noiseVar;
                    avgDiversitySNR = 10 * Math.log10(snr);
                }
                
                tradeoffData.push({
                    multiplexing: multiplexingGain,
                    diversity: diversityGain,
                    rate: totalRate,
                    avgSNR: avgDiversitySNR
                });
            }
            
            return tradeoffData;
        }

        function drawTradeoffPlot(canvasId, tradeoffData, currentMux) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
            const padding = 60;
            const plotWidth = canvas.width - 2 * padding;
            const plotHeight = canvas.height - 2 * padding;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw axes
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();
            
            const maxMux = Math.max(...tradeoffData.map(d => d.multiplexing));
            const maxDiv = Math.max(...tradeoffData.map(d => d.diversity));
            
            // Draw grid
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding + (plotHeight / 5) * i;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(canvas.width - padding, y);
                ctx.stroke();
                
                const x = padding + (plotWidth / 5) * i;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, canvas.height - padding);
                ctx.stroke();
            }
            
            // Draw tradeoff curve connecting actual data points
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            
            tradeoffData.forEach((d, i) => {
                const x = padding + (d.multiplexing / maxMux) * plotWidth;
                const y = canvas.height - padding - (d.diversity / maxDiv) * plotHeight;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            
            // Draw points on the tradeoff curve
            tradeoffData.forEach((d) => {
                const x = padding + (d.multiplexing / maxMux) * plotWidth;
                const y = canvas.height - padding - (d.diversity / maxDiv) * plotHeight;
                
                const isCurrent = d.multiplexing === currentMux;
                
                // Draw point
                ctx.fillStyle = isCurrent ? '#FFD700' : '#333';
                ctx.beginPath();
                ctx.arc(x, y, isCurrent ? 7 : 5, 0, 2 * Math.PI);
                ctx.fill();
                
                // Add label for each point
                ctx.fillStyle = '#333';
                ctx.font = isCurrent ? 'bold 11px Arial' : '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`(${d.multiplexing}, ${d.diversity})`, x, y - 12);
                
                // Highlight current selection with ring
                if (isCurrent) {
                    ctx.strokeStyle = '#FFD700';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, y, 11, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            });
            
            // Draw axis labels
            ctx.fillStyle = '#333';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            
            // X-axis label
            ctx.fillText('Multiplexing Gain r', canvas.width / 2, canvas.height - 15);
            
            // Y-axis label
            ctx.save();
            ctx.translate(15, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Diversity Gain d(r)', 0, 0);
            ctx.restore();
            
            // Draw axis tick labels
            ctx.font = '11px Arial';
            ctx.fillStyle = '#666';
            
            // X-axis ticks
            ctx.textAlign = 'center';
            for (let i = 0; i <= maxMux; i++) {
                const x = padding + (i / maxMux) * plotWidth;
                ctx.fillText(i.toString(), x, canvas.height - padding + 18);
            }
            
            // Y-axis ticks
            ctx.textAlign = 'right';
            const step = maxDiv <= 5 ? 1 : Math.ceil(maxDiv / 5);
            for (let i = 0; i <= maxDiv; i += step) {
                const y = canvas.height - padding - (i / maxDiv) * plotHeight;
                ctx.fillText(i.toString(), padding - 10, y + 4);
            }
            
            // Add corner point labels
            ctx.font = '10px Arial';
            ctx.fillStyle = '#667eea';
            ctx.textAlign = 'left';
            ctx.fillText(`(0, ${maxDiv})`, padding + 5, padding + 15);
            ctx.textAlign = 'right';
            ctx.fillText(`(${maxMux}, 0)`, canvas.width - padding - 5, canvas.height - padding - 5);
        }

        function handleMainAction() {
            if (systemState === 'initial') {
                generateSystem();
            } else if (systemState === 'generated') {
                optimizeSystem();
            }
        }

        // ----------------------
        // Helper: partition n indices into r groups (round-robin after giving 1 each)
        // ----------------------
        function partitionIndices(n, r) {
            const groups = Array.from({length: r}, ()=>[]);
            // first give 1 to each stream (ensure r <= n always validated earlier)
            for (let i = 0; i < r; i++) groups[i].push(i);
            // distribute remaining indices
            let idx = r;
            let g = 0;
            while (idx < n) {
                groups[g % r].push(idx);
                idx++; g++;
            }
            return groups;
        }

        function generateSystem() {
            const txPower = parseFloat(document.getElementById('txPower').value);
            const numTx = parseInt(document.getElementById('numTx').value);
            const numRx = parseInt(document.getElementById('numRx').value);
            const numStreams = parseInt(document.getElementById('numStreams').value);

            if (numStreams > Math.min(numTx, numRx)) {
                alert('Number of streams must be ≤ min(Nt, Nr)');
                return;
            }

            channelMatrix = generateChannelMatrix(numTx, numRx);
            
            const HHH = computeHHH(channelMatrix);
            singularValues = computeEigenvalues(HHH);

            antennaConfig.tx = Array(numTx).fill(0).map((_, i) => ({x: 0, y: 0, id: i}));
            antennaConfig.rx = Array(numRx).fill(0).map((_, i) => ({x: 0, y: 0, id: i}));
            antennaConfig.multiplexing = [];
            antennaConfig.diversity = [];
            antennaConfig.selectedMessage = -1;

            document.getElementById('channelDim').textContent = `${numRx} × ${numTx}`;
            
            const matrixDisplay = document.getElementById('matrixDisplay');
            matrixDisplay.innerHTML = '';
            for (let i = 0; i < numRx; i++) {
                const row = document.createElement('div');
                row.className = 'matrix-row';
                for (let j = 0; j < numTx; j++) {
                    const val = channelMatrix[i][j];
                    const span = document.createElement('span');
                    span.className = 'matrix-value';
                    span.textContent = `${val.real.toFixed(2)}${val.imag >= 0 ? '+' : ''}${val.imag.toFixed(2)}i`;
                    row.appendChild(span);
                }
                matrixDisplay.appendChild(row);
            }
            document.getElementById('matrixSection').style.display = 'block';

            document.getElementById('stepIndicator').textContent = 'Step 2: System generated. Click "Optimize System" to allocate antennas';
            document.getElementById('mainBtn').textContent = 'Optimize System';
            
            // Hide sections that don't exist or shouldn't be shown yet
            document.getElementById('snrSection').style.display = 'none';
            document.getElementById('tradeoffSection').style.display = 'none';

            systemState = 'generated';
            drawAntennaSystem();
        }

        function optimizeSystem() {
            const txPower = parseFloat(document.getElementById('txPower').value) || 1e-12;
            const numTx = parseInt(document.getElementById('numTx').value);
            const numRx = parseInt(document.getElementById('numRx').value);
            const r = parseInt(document.getElementById('numStreams').value);
            const noiseVar = parseFloat(document.getElementById('noiseVar').value) || 1e-12;
            const snrThreshold = parseFloat(document.getElementById('snrThreshold').value);

            if (!channelMatrix || channelMatrix.length === 0) { 
                alert('Generate system first'); 
                return; 
            }
            if (r < 1 || r > Math.min(numTx, numRx)) { 
                alert('r must be between 1 and min(Nt,Nr)'); 
                return; 
            }

            // Compute true SVD-based allocation
            const svd = computeTopRSVD(channelMatrix, r, 80);

            function pickLeadersFromSVD(svd) {
                const leadersTx = [];
                const leadersRx = [];
                const rLocal = svd.V.length;
                for (let k = 0; k < rLocal; k++) {
                    // pick transmit antenna index with largest |V_jk|
                    let bestTx = 0, bestValTx = -1;
                    const vvec = svd.V[k];
                    for (let j = 0; j < vvec.length; j++) {
                        const val = cAbs2(vvec[j]);
                        if (val > bestValTx) { bestValTx = val; bestTx = j; }
                    }
                    leadersTx.push(bestTx);

                    // pick receive antenna index with largest |U_ik|
                    let bestRx = 0, bestValRx = -1;
                    const uvec = svd.U[k];
                    for (let i = 0; i < uvec.length; i++) {
                        const val = cAbs2(uvec[i]);
                        if (val > bestValRx) { bestValRx = val; bestRx = i; }
                    }
                    leadersRx.push(bestRx);
                }
                return { leadersTx, leadersRx };
            }

            const { leadersTx, leadersRx } = pickLeadersFromSVD(svd);

            // Stream strengths are the singular values (sorted descending by SVD)
            const streamStrengths = svd.S.slice(0, r);

            // Create groups: weakest stream (r-1) gets first diversity antenna, then round-robin upward
            const txGroups = createDiversityGroupsWeakestFirst(numTx, r, leadersTx, streamStrengths);
            const rxGroups = createDiversityGroupsWeakestFirst(numRx, r, leadersRx, streamStrengths);

            // Equal power per stream
            const P_per_stream = txPower / r;

            const groups = [];
            for (let s = 0; s < r; s++) {
                const txSet = txGroups[s];
                const rxSet = rxGroups[s];

                // compute effective energy gain
                let totalGain = 0;
                for (const txIdx of txSet) {
                    for (const rxIdx of rxSet) {
                        const c = channelMatrix[rxIdx][txIdx];
                        if (!c) continue;
                        totalGain += (c.real * c.real + c.imag * c.imag);
                    }
                }

                const snrLinear = (P_per_stream * totalGain) / Math.max(noiseVar, 1e-18);
                const snrDB = 10 * Math.log10(snrLinear + 1e-12);

                groups.push({
                    index: s,
                    txSet,
                    rxSet,
                    totalGain,
                    snr: snrLinear,
                    snrDB,
                    isOutage: snrDB < snrThreshold,
                    label: `Stream ${s + 1} (${txSet.length}Tx × ${rxSet.length}Rx)`,
                    strength: streamStrengths[s]
                });
            }

            // Find weakest stream
            let minIdx = 0;
            for (let i = 1; i < groups.length; i++) {
                if (groups[i].strength < groups[minIdx].strength) minIdx = i;
            }

            // Store in antennaConfig
            antennaConfig.groups = groups;
            antennaConfig.selectedMessage = minIdx;

            // Update SNR list with outage indication
            const snrListDiv = document.getElementById('snrList');
            snrListDiv.innerHTML = '';
            groups.forEach(g => {
                const div = document.createElement('div');
                div.className = `snr-item ${g.isOutage ? 'outage' : 'multiplexing'}`;
                div.innerHTML = `<span>${g.label}</span><strong style="color: ${g.isOutage ? '#f44' : 'inherit'}">${g.snrDB.toFixed(2)} dB${g.isOutage ? ' (OUTAGE)' : ''}</strong>`;
                snrListDiv.appendChild(div);
            });

            // Tradeoff plot
            document.getElementById('tradeoffSection').style.display = 'block';
            const tradeoffData = generateTradeoffCurve(numTx, numRx, txPower, noiseVar, channelMatrix);
            drawTradeoffPlot('tradeoffCanvas', tradeoffData, r);

            // Show sections
            document.getElementById('snrSection').style.display = 'block';
            document.getElementById('stepIndicator').textContent = 'Step 3: Diversity antennas added to weakest streams first (round-robin)';
            document.getElementById('mainBtn').textContent = 'Optimized';
            document.getElementById('mainBtn').disabled = true;

            systemState = 'optimized';
            drawAntennaSystem();
        }

        function drawAntennaSystem() {
            if (!antennaConfig.tx || antennaConfig.tx.length === 0) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const numTx = antennaConfig.tx.length;
            const numRx = antennaConfig.rx.length;

            // Define color palette for groups (softer colors)
            const groupColors = [
                { main: '#5E72E4', light: 'rgba(94, 114, 228, 0.35)' },  // Soft blue
                { main: '#2DCE89', light: 'rgba(45, 206, 137, 0.35)' },  // Soft green
                { main: '#F5365C', light: 'rgba(245, 54, 92, 0.35)' },   // Soft red
                { main: '#FB6340', light: 'rgba(251, 99, 64, 0.35)' },   // Soft orange
                { main: '#8965E0', light: 'rgba(137, 101, 224, 0.35)' }, // Soft purple
                { main: '#11CDEF', light: 'rgba(17, 205, 239, 0.35)' },  // Soft cyan
                { main: '#F7B924', light: 'rgba(247, 185, 36, 0.35)' },  // Soft amber
                { main: '#2B3E50', light: 'rgba(43, 62, 80, 0.35)' }     // Soft dark
            ];

            // Dynamic layout
            const marginX = Math.min(canvas.width * 0.08, 140);
            const marginY = Math.min(canvas.height * 0.08, 80);
            const txX = marginX;
            const rxX = canvas.width - marginX;

            // Calculate spacing with gaps between groups
            let spacing, txStartY, rxStartY;

            if (systemState === 'optimized' && antennaConfig.groups && antennaConfig.groups.length > 0) {
                const groups = antennaConfig.groups;
                const gapBetweenGroups = 80; // Gap between different stream groups
                const antennaSpacing = 45; // Spacing within a group
                const boxPadding = 25; // Padding inside boxes
                const extraBoxMargin = 15; // Extra margin to prevent box overlap
                
                // Calculate total height needed for TX (including box padding and margins)
                let totalTxHeight = 0;
                groups.forEach((g, idx) => {
                    totalTxHeight += (g.txSet.length - 1) * antennaSpacing + 2 * (boxPadding + extraBoxMargin);
                    if (idx < groups.length - 1) {
                        totalTxHeight += gapBetweenGroups;
                    }
                });
                
                // Calculate total height needed for RX
                let totalRxHeight = 0;
                groups.forEach((g, idx) => {
                    totalRxHeight += (g.rxSet.length - 1) * antennaSpacing + 2 * (boxPadding + extraBoxMargin);
                    if (idx < groups.length - 1) {
                        totalRxHeight += gapBetweenGroups;
                    }
                });
                
                let txStartY = (canvas.height - totalTxHeight) / 2;
                let rxStartY = (canvas.height - totalRxHeight) / 2;
                
                // Position TX antennas with proper separation
                let currentTxY = txStartY + boxPadding + extraBoxMargin;
                for (let g = 0; g < groups.length; g++) {
                    const group = groups[g];
                    for (let idx = 0; idx < group.txSet.length; idx++) {
                        const antennaIdx = group.txSet[idx];
                        antennaConfig.tx[antennaIdx].x = txX;
                        antennaConfig.tx[antennaIdx].y = currentTxY;
                        antennaConfig.tx[antennaIdx].groupIndex = g;
                        if (idx < group.txSet.length - 1) {
                            currentTxY += antennaSpacing;
                        }
                    }
                    // Move to next group position
                    if (g < groups.length - 1) {
                        currentTxY += boxPadding + extraBoxMargin + gapBetweenGroups + boxPadding + extraBoxMargin;
                    }
                }
                
                // Position RX antennas with proper separation
                let currentRxY = rxStartY + boxPadding + extraBoxMargin;
                for (let g = 0; g < groups.length; g++) {
                    const group = groups[g];
                    for (let idx = 0; idx < group.rxSet.length; idx++) {
                        const antennaIdx = group.rxSet[idx];
                        antennaConfig.rx[antennaIdx].x = rxX;
                        antennaConfig.rx[antennaIdx].y = currentRxY;
                        antennaConfig.rx[antennaIdx].groupIndex = g;
                        if (idx < group.rxSet.length - 1) {
                            currentRxY += antennaSpacing;
                        }
                    }
                    // Move to next group position
                    if (g < groups.length - 1) {
                        currentRxY += boxPadding + extraBoxMargin + gapBetweenGroups + boxPadding + extraBoxMargin;
                    }
                }
            } else {
                // Original positioning for 'generated' state
                spacing = Math.min(50, (canvas.height - 2 * marginY) / Math.max(numTx, numRx));
                const totalTxHeight = (numTx - 1) * spacing;
                const totalRxHeight = (numRx - 1) * spacing;
                txStartY = (canvas.height - totalTxHeight) / 2;
                rxStartY = (canvas.height - totalRxHeight) / 2;

                for (let i = 0; i < numTx; i++) {
                    antennaConfig.tx[i].x = txX;
                    antennaConfig.tx[i].y = txStartY + i * spacing;
                }
                for (let i = 0; i < numRx; i++) {
                    antennaConfig.rx[i].x = rxX;
                    antennaConfig.rx[i].y = rxStartY + i * spacing;
                }
            }

                if (systemState === 'generated') {
                    // Draw all channel links (faded)
                    ctx.strokeStyle = 'rgba(33, 150, 243, 0.3)';
                    ctx.lineWidth = 2;
                    for (let i = 0; i < numTx; i++) {
                        for (let j = 0; j < numRx; j++) {
                            ctx.beginPath();
                            ctx.moveTo(antennaConfig.tx[i].x, antennaConfig.tx[i].y);
                            ctx.lineTo(antennaConfig.rx[j].x, antennaConfig.rx[j].y);
                            ctx.stroke();
                        }
                    }

                    // Draw all TX antennas
                    antennaConfig.tx.forEach((tx, i) => {
                        ctx.fillStyle = '#2196F3';
                        ctx.beginPath();
                        ctx.arc(tx.x, tx.y, 15, 0, 2 * Math.PI);
                        ctx.fill();
                        
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`T${i + 1}`, tx.x, tx.y);
                    });

                    // Draw all RX antennas
                    antennaConfig.rx.forEach((rx, i) => {
                        ctx.fillStyle = '#2196F3';
                        ctx.beginPath();
                        ctx.arc(rx.x, rx.y, 15, 0, 2 * Math.PI);
                        ctx.fill();
                        
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`R${i + 1}`, rx.x, rx.y);
                    });

                    // Draw labels
                    ctx.fillStyle = '#333';
                    ctx.font = 'bold 16px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Transmitters', txX, 30);
                    ctx.fillText('Receivers', rxX, 30);

                } else if (systemState === 'optimized') {
                    const groups = antennaConfig.groups || [];
                    
                    // Draw faint full-links in background
                    ctx.strokeStyle = 'rgba(33,150,243,0.08)';
                    ctx.lineWidth = 1;
                    for (let t = 0; t < numTx; t++) {
                        for (let rcv = 0; rcv < numRx; rcv++) {
                            ctx.beginPath();
                            ctx.moveTo(antennaConfig.tx[t].x, antennaConfig.tx[t].y);
                            ctx.lineTo(antennaConfig.rx[rcv].x, antennaConfig.rx[rcv].y);
                            ctx.stroke();
                        }
                    }

                    // Draw groups with proper boxes and connections
                    const boxInset = 45;
                    const boxPadding = 25; // Must match the value used in positioning

                    groups.forEach((g, idx) => {
                        // Get antenna positions for this group
                        const txYs = g.txSet.map(i => antennaConfig.tx[i].y);
                        const rxYs = g.rxSet.map(i => antennaConfig.rx[i].y);

                        // Calculate box boundaries with consistent padding
                        const txTop = Math.min(...txYs) - boxPadding;
                        const txBottom = Math.max(...txYs) + boxPadding;
                        const rxTop = Math.min(...rxYs) - boxPadding;
                        const rxBottom = Math.max(...rxYs) + boxPadding;

                        const boxWidth = 70;
                        const txBoxLeft = txX + boxInset;
                        const txBoxRight = txBoxLeft + boxWidth;
                        const rxBoxRight = rxX - boxInset;
                        const rxBoxLeft = rxBoxRight - boxWidth;

                        // Determine colors
                        const isWeakest = antennaConfig.selectedMessage === g.index;
                        const isOutage = g.isOutage;
                        const colorScheme = groupColors[idx % groupColors.length];
                        const boxColor = isOutage ? '#f44' : (isWeakest ? '#FF9800' : colorScheme.main);
                        const linkColor = isOutage ? 'rgba(255, 68, 68, 0.5)' : (isWeakest ? 'rgba(255, 152, 0, 0.5)' : colorScheme.light);
                        const boxLineWidth = (isOutage || isWeakest) ? 3 : 2;

                        // Draw TX box with rounded corners for better visual separation
                        ctx.setLineDash([5, 5]);
                        ctx.strokeStyle = boxColor;
                        ctx.lineWidth = boxLineWidth;
                        ctx.strokeRect(txBoxLeft, txTop, boxWidth, txBottom - txTop);

                        // Draw RX box
                        ctx.strokeRect(rxBoxLeft, rxTop, boxWidth, rxBottom - rxTop);
                        ctx.setLineDash([]);

                        // Label boxes - position above the box
                        ctx.fillStyle = boxColor;
                        ctx.font = 'bold 11px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(g.label, (txBoxLeft + txBoxRight) / 2, txTop - 8);


                        // Draw channel links between TX and RX boxes (only within group)
                        ctx.strokeStyle = linkColor;
                        ctx.lineWidth = 2;
                        for (const txIdx of g.txSet) {
                            for (const rxIdx of g.rxSet) {
                                ctx.beginPath();
                                ctx.moveTo(txBoxRight, antennaConfig.tx[txIdx].y);
                                ctx.lineTo(rxBoxLeft, antennaConfig.rx[rxIdx].y);
                                ctx.stroke();
                            }
                        }

                        // Calculate center points for wire connections
                        const txCenterY = (txTop + txBottom) / 2;
                        const rxCenterY = (rxTop + rxBottom) / 2;
                        
                        ctx.strokeStyle = boxColor;
                        ctx.lineWidth = 3;
                        
                        // Draw input wire (single wire splitting to multiple TX antennas)
                        ctx.beginPath();
                        ctx.moveTo(txBoxLeft - 40, txCenterY);
                        ctx.lineTo(txBoxLeft, txCenterY);
                        ctx.stroke();
                        
                        // Split to each TX antenna in group
                        ctx.lineWidth = 2;
                        for (const txIdx of g.txSet) {
                            ctx.beginPath();
                            ctx.moveTo(txBoxLeft, txCenterY);
                            ctx.lineTo(txBoxLeft, antennaConfig.tx[txIdx].y);
                            ctx.stroke();
                        }

                        // Draw output wires (multiple RX antennas combining to single wire)
                        for (const rxIdx of g.rxSet) {
                            ctx.beginPath();
                            ctx.moveTo(rxBoxRight, antennaConfig.rx[rxIdx].y);
                            ctx.lineTo(rxBoxRight, rxCenterY);
                            ctx.stroke();
                        }
                        
                        // Main output wire
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(rxBoxRight, rxCenterY);
                        ctx.lineTo(rxBoxRight + 40, rxCenterY);
                        ctx.stroke();

                        // Draw symbol labels on wires
                        ctx.fillStyle = boxColor;
                        ctx.font = 'bold 12px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(`x${g.index + 1}`, txBoxLeft - 20, txCenterY - 8);
                        ctx.fillText(`y${g.index + 1}`, rxBoxRight + 20, rxCenterY - 8);
                    });

                    // Draw antennas on top
                    antennaConfig.tx.forEach((tx, i) => {
                        let groupIdx = -1;
                        for (let g = 0; g < groups.length; g++) {
                            if (groups[g].txSet.includes(i)) {
                                groupIdx = g;
                                break;
                            }
                        }

                        const isWeakest = groupIdx >= 0 && antennaConfig.selectedMessage === groupIdx;
                        const isOutage = groupIdx >= 0 && groups[groupIdx].isOutage;
                        const colorScheme = groupIdx >= 0 ? groupColors[groupIdx % groupColors.length] : { main: '#999' };
                        
                        ctx.fillStyle = isOutage ? '#f44' : (isWeakest ? '#FF9800' : colorScheme.main);
                        ctx.beginPath();
                        ctx.arc(tx.x, tx.y, 13, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 11px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`T${i + 1}`, tx.x, tx.y);
                    });

                    antennaConfig.rx.forEach((rx, i) => {
                        let groupIdx = -1;
                        for (let g = 0; g < groups.length; g++) {
                            if (groups[g].rxSet.includes(i)) {
                                groupIdx = g;
                                break;
                            }
                        }

                        const isWeakest = groupIdx >= 0 && antennaConfig.selectedMessage === groupIdx;
                        const isOutage = groupIdx >= 0 && groups[groupIdx].isOutage;
                        const colorScheme = groupIdx >= 0 ? groupColors[groupIdx % groupColors.length] : { main: '#999' };
                        
                        ctx.fillStyle = isOutage ? '#f44' : (isWeakest ? '#FF9800' : colorScheme.main);
                        ctx.beginPath();
                        ctx.arc(rx.x, rx.y, 13, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 11px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`R${i + 1}`, rx.x, rx.y);
                    });

                    // Draw labels
                    ctx.fillStyle = '#333';
                    ctx.font = 'bold 16px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Transmitters', txX, 40);
                    ctx.fillText('Receivers', rxX, 40);
                }
        }

        // returns array of top `k` tx indices by column energy (or rx by rowEnergy)
        function topIndicesByEnergy(H, k, axis = 'tx') {
            // H is nr x nt, same shape as your generateChannelMatrix output
            const nr = H.length;
            const nt = H[0].length;

            const energies = []; // pairs [index, energy]

            if (axis === 'tx') {
                // column energy for each transmit antenna j
                for (let j = 0; j < nt; j++) {
                    let e = 0;
                    for (let i = 0; i < nr; i++) {
                        const c = H[i][j];
                        e += (c.real * c.real + c.imag * c.imag);
                    }
                    energies.push([j, e]);
                }
            } else {
                // row energy for each receive antenna i
                for (let i = 0; i < nr; i++) {
                    let e = 0;
                    for (let j = 0; j < nt; j++) {
                        const c = H[i][j];
                        e += (c.real * c.real + c.imag * c.imag);
                    }
                    energies.push([i, e]);
                }
            }

            // sort descending by energy and return top k indices
            energies.sort((a, b) => b[1] - a[1]);
            return energies.slice(0, k).map(p => p[0]);
        }

        // n = total antennas (numTx or numRx), r = number of streams,
        // leaders = array of leader indices of length r (must be unique inside [0,n))
        // returns array of r groups (arrays of indices) where each group starts with its leader
        // Modified allocation: Weakest stream gets first diversity antenna, then round-robin
        function createDiversityGroupsWeakestFirst(n, r, leaders, streamStrengths) {
            const groups = Array.from({length: r}, () => []);
            const used = new Set();

            // CRITICAL: Ensure leaders are unique - if there are duplicates, we have a problem
            const uniqueLeaders = [...new Set(leaders)];
            if (uniqueLeaders.length !== leaders.length) {
                console.warn('WARNING: Duplicate leaders detected!', leaders);
            }

            // Assign leaders as first element of each group
            for (let g = 0; g < r; g++) {
                const leader = (leaders && leaders[g] !== undefined) ? leaders[g] : g;
                if (used.has(leader)) {
                    console.error(`Leader ${leader} already assigned to another group!`);
                    // Skip or find an alternative
                    continue;
                }
                groups[g].push(leader);
                used.add(leader);
            }

            // Build list of remaining indices - MUST exclude all used leaders
            const remaining = [];
            for (let i = 0; i < n; i++) {
                if (!used.has(i)) {
                    remaining.push(i);
                }
            }

            console.log('Leaders:', leaders, 'Used:', Array.from(used), 'Remaining:', remaining);

            if (remaining.length === 0) return groups;

            // Create stream ordering: weakest to strongest (indices sorted by ascending strength)
            const streamOrder = streamStrengths
                .map((strength, idx) => ({ idx, strength }))
                .sort((a, b) => a.strength - b.strength)
                .map(item => item.idx);

            // Distribute diversity antennas starting with weakest stream, round-robin
            let orderIdx = 0;
            for (const antenna of remaining) {
                const streamIdx = streamOrder[orderIdx % r];
                groups[streamIdx].push(antenna);
                orderIdx++;
            }

            console.log('Final groups:', groups);
            return groups;
        }

        // Complex arithmetic helpers (works with {real, imag})
        function cMul(a, b) {
            return { real: a.real * b.real - a.imag * b.imag, imag: a.real * b.imag + a.imag * b.real };
        }
        function cAdd(a, b) { return { real: a.real + b.real, imag: a.imag + b.imag }; }
        function cSub(a, b) { return { real: a.real - b.real, imag: a.imag - b.imag }; }
        function cConj(a) { return { real: a.real, imag: -a.imag }; }
        function cAbs2(a) { return a.real * a.real + a.imag * a.imag; }
        function cScale(a, s) { return { real: a.real * s, imag: a.imag * s }; }

        // H is nr x nt (H[row][col])
        function buildHermitianA(H) {
            const nr = H.length;
            const nt = H[0].length;
            const A = Array.from({length: nt}, () => Array.from({length: nt}, () => ({ real: 0, imag: 0 })));
            for (let j = 0; j < nt; j++) {
                for (let k = 0; k < nt; k++) {
                    let sum = { real: 0, imag: 0 };
                    for (let i = 0; i < nr; i++) {
                        // conj(H[i][j]) * H[i][k]
                        const prod = cMul(cConj(H[i][j]), H[i][k]);
                        sum = cAdd(sum, prod);
                    }
                    A[j][k] = sum;
                }
            }
            return A;
        }

        function matVecMul(A, v) { // A: n x n complex, v: n complex
            const n = A.length;
            const out = new Array(n).fill(null).map(()=>({real:0, imag:0}));
            for (let i = 0; i < n; i++) {
                let s = { real: 0, imag: 0 };
                for (let j = 0; j < n; j++) {
                    s = cAdd(s, cMul(A[i][j], v[j]));
                }
                out[i] = s;
            }
            return out;
        }
        function vecNorm(v) {
            let s = 0;
            for (let i = 0; i < v.length; i++) s += cAbs2(v[i]);
            return Math.sqrt(s);
        }
        function normalizeVec(v) {
            const nrm = vecNorm(v) || 1e-18;
            return v.map(x => cScale(x, 1 / nrm));
        }
        function conjDot(a, b) { // a^H b (complex)
            let s = { real: 0, imag: 0 };
            for (let i = 0; i < a.length; i++) s = cAdd(s, cMul(cConj(a[i]), b[i]));
            return s;
        }

        // returns { vals: [lambda1, ...], vecs: [[v1_j], ...] } where vecs is array of vectors (complex)
        function topR_eigs_by_power(A, r, iters = 60) {
            const n = A.length;
            const vals = [];
            const vecs = [];
            // make a deep copy of A for deflation
            let Acopy = A.map(row => row.map(el => ({ real: el.real, imag: el.imag })));

            for (let k = 0; k < r; k++) {
                // random complex initial vector
                let v = new Array(n).fill(0).map(() => ({ real: Math.random(), imag: Math.random() }));
                v = normalizeVec(v);

                for (let it = 0; it < iters; it++) {
                    let w = matVecMul(Acopy, v);
                    const nrm = vecNorm(w) || 1e-18;
                    v = w.map(x => cScale(x, 1 / nrm));
                }
                // Rayleigh quotient (approx eigenvalue)
                const wFinal = matVecMul(Acopy, v);
                const rd = conjDot(v, wFinal); // complex but should be real for Hermitian
                const lambda = Math.max(0, rd.real); // numerical safety

                // store
                vals.push(lambda);
                vecs.push(v);

                // deflate: Acopy = Acopy - lambda * (v v^H)
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < n; j++) {
                        // outer = lambda * v[i] * conj(v[j])
                        const outer = cScale(cMul(v[i], cConj(v[j])), lambda);
                        Acopy[i][j] = cSub(Acopy[i][j], outer);
                    }
                }
            }

            return { vals, vecs };
        }

        // H: nr x nt, r: number of modes
        function computeTopRSVD(H, r, iters = 60) {
            const nr = H.length;
            const nt = H[0].length;

            // 1) form Hermitian A = H^H H (nt x nt)
            const A = buildHermitianA(H);

            // 2) top-r eigenpairs of A => right singular vectors V (in columns), eigenvalues = sigma^2
            const eig = topR_eigs_by_power(A, Math.min(r, nt), iters);
            const lambdas = eig.vals; // sigma^2
            const Vvecs = eig.vecs;   // each is length nt

            // 3) form U vectors: u_k = (H * v_k) / sigma_k
            const U = [];
            const V = []; // nt x r
            const S = [];

            for (let k = 0; k < Vvecs.length; k++) {
                const vk = Vvecs[k];
                const lambda = lambdas[k];
                const sigma = Math.sqrt(Math.max(lambda, 0));
                S.push(sigma);

                // compute H * v_k (nr complex)
                const Hv = new Array(nr).fill(0).map(()=>({real:0, imag:0}));
                for (let i = 0; i < nr; i++) {
                    let s = { real: 0, imag: 0 };
                    for (let j = 0; j < nt; j++) s = cAdd(s, cMul(H[i][j], vk[j]));
                    Hv[i] = s;
                }

                // if sigma is tiny, produce a fallback normalized Hv
                let uk;
                if (sigma < 1e-12) {
                    uk = normalizeVec(Hv);
                } else {
                    uk = Hv.map(x => cScale(x, 1 / sigma));
                    uk = normalizeVec(uk);
                }
                U.push(uk);

                // store V as column vector (nt entries). normalize vk
                V.push(normalizeVec(vk));
            }

            // transpose V to nt x r structure (array of columns is V; keep as columns for picking largest component)
            return { U, V, S }; // U: r arrays length nr, V: r arrays length nt, S: array length r
        }

        function resetExperiment() {
            channelMatrix = [];
            singularValues = [];
            beamformingVectors = { v: [], u: [] };
            antennaConfig = {
                tx: [],
                rx: [],
                multiplexing: [],
                diversity: [],
                selectedMessage: -1
            };
            systemState = 'initial';

            document.getElementById('channelDim').textContent = '-';
            document.getElementById('snrList').innerHTML = '';
            
            document.getElementById('stepIndicator').textContent = 'Step 1: Enter parameters and generate system';
            document.getElementById('mainBtn').textContent = 'Generate System';
            document.getElementById('mainBtn').disabled = false;

            document.getElementById('matrixSection').style.display = 'none';
            document.getElementById('snrSection').style.display = 'none';
            document.getElementById('tradeoffSection').style.display = 'none';

            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setTimeout(resizeCanvas, 100);

        function switchTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            // Update sections
            document.querySelectorAll('.page-section').forEach(section => {
                section.classList.remove('active');
            });
            
            if (tabName === 'simulation') {
                document.getElementById('simulationSection').classList.add('active');
            } else if (tabName === 'analysis') {
                document.getElementById('analysisSection').classList.add('active');
                // Check if system is ready for analysis
                if (!channelMatrix || channelMatrix.length === 0 || systemState !== 'optimized') {
                    alert('Please generate and optimize the system in the Simulation tab first!');
                    switchTab('simulation');
                }
            }
        }

        function runAnalysis() {
            const txPower = parseFloat(document.getElementById('txPower').value) || 1e-12;
            const numTx = parseInt(document.getElementById('numTx').value);
            const numRx = parseInt(document.getElementById('numRx').value);
            const r = parseInt(document.getElementById('numStreams').value);
            const noiseVar = parseFloat(document.getElementById('noiseVar').value) || 1e-12;

            if (!channelMatrix || channelMatrix.length === 0 || systemState !== 'optimized') {
                alert('Please generate and optimize system in Simulation tab first!');
                return;
            }

            // Get analysis parameters
            const numTrials = parseInt(document.getElementById('numTrials').value);
            const minSNR_dB = parseFloat(document.getElementById('minSNR').value);
            const maxSNR_dB = parseFloat(document.getElementById('maxSNR').value);
            const snrStep = parseFloat(document.getElementById('snrStep').value);
            
            // Parse user-specified SNR thresholds for marking
            const snrThresholdsInput = document.getElementById('snrThresholds').value;
            const userThresholds = snrThresholdsInput.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
            
            if (userThresholds.length === 0) {
                alert('Please provide at least one valid SNR threshold!');
                return;
            }

            // Show loading indicator
            document.getElementById('runAnalysisBtn').textContent = 'Running Analysis...';
            document.getElementById('runAnalysisBtn').disabled = true;

            setTimeout(() => {
                // First, run Monte Carlo to get distribution of minimum stream SNRs
                const minStreamSNRs_dB = [];
                
                // Use FIXED transmit power from simulation tab
                const P_total = txPower;
                const P_per_stream = P_total / r;

                for (let trial = 0; trial < numTrials; trial++) {
                    const H_trial = generateChannelMatrix(numTx, numRx);
                    const svd = computeTopRSVD(H_trial, r, 40);
                    
                    function pickLeadersFromSVD_local(svd) {
                        const leadersTx = [];
                        const leadersRx = [];
                        const rLocal = svd.V.length;
                        for (let k = 0; k < rLocal; k++) {
                            let bestTx = 0, bestValTx = -1;
                            const vvec = svd.V[k];
                            for (let j = 0; j < vvec.length; j++) {
                                const val = cAbs2(vvec[j]);
                                if (val > bestValTx) { bestValTx = val; bestTx = j; }
                            }
                            leadersTx.push(bestTx);

                            let bestRx = 0, bestValRx = -1;
                            const uvec = svd.U[k];
                            for (let i = 0; i < uvec.length; i++) {
                                const val = cAbs2(uvec[i]);
                                if (val > bestValRx) { bestValRx = val; bestRx = i; }
                            }
                            leadersRx.push(bestRx);
                        }
                        return { leadersTx, leadersRx };
                    }

                    const { leadersTx, leadersRx } = pickLeadersFromSVD_local(svd);
                    const streamStrengths = svd.S.slice(0, r);

                    const txGroups = createDiversityGroupsWeakestFirst(numTx, r, leadersTx, streamStrengths);
                    const rxGroups = createDiversityGroupsWeakestFirst(numRx, r, leadersRx, streamStrengths);
                    
                    let minStreamSNR_linear = Infinity;

                    for (let s = 0; s < r; s++) {
                        const txSet = txGroups[s];
                        const rxSet = rxGroups[s];

                        let totalGain = 0;
                        for (const txIdx of txSet) {
                            for (const rxIdx of rxSet) {
                                const c = H_trial[rxIdx][txIdx];
                                if (!c) continue;
                                totalGain += (c.real * c.real + c.imag * c.imag);
                            }
                        }

                        const snr = (P_per_stream * totalGain) / noiseVar;
                        minStreamSNR_linear = Math.min(minStreamSNR_linear, snr);
                    }

                    const minStreamSNR_dB = 10 * Math.log10(Math.max(minStreamSNR_linear, 1e-12));
                    minStreamSNRs_dB.push(minStreamSNR_dB);
                }

                // Now compute outage probability for range of thresholds
                const thresholdRange_dB = [];
                for (let threshold = minSNR_dB; threshold <= maxSNR_dB; threshold += snrStep) {
                    thresholdRange_dB.push(threshold);
                }

                const outageProb = [];
                for (const threshold of thresholdRange_dB) {
                    // Count how many trials have min stream SNR below this threshold
                    const outageCount = minStreamSNRs_dB.filter(snr => snr < threshold).length;
                    outageProb.push(outageCount / numTrials);
                }

                // === CAPACITY VS SNR (varying transmit power) ===
                const snrRange_dB = [];
                for (let snr = minSNR_dB; snr <= maxSNR_dB; snr += snrStep) {
                    snrRange_dB.push(snr);
                }

                const avgCapacity = [];

                for (const targetSNR_dB of snrRange_dB) {
                    const targetSNR_linear = Math.pow(10, targetSNR_dB / 10);
                    const P_total_var = targetSNR_linear * noiseVar;
                    
                    let totalCapacity = 0;

                    for (let trial = 0; trial < numTrials; trial++) {
                        const H_trial = generateChannelMatrix(numTx, numRx);
                        const svd = computeTopRSVD(H_trial, r, 40);
                        
                        function pickLeadersFromSVD_local(svd) {
                            const leadersTx = [];
                            const leadersRx = [];
                            const rLocal = svd.V.length;
                            for (let k = 0; k < rLocal; k++) {
                                let bestTx = 0, bestValTx = -1;
                                const vvec = svd.V[k];
                                for (let j = 0; j < vvec.length; j++) {
                                    const val = cAbs2(vvec[j]);
                                    if (val > bestValTx) { bestValTx = val; bestTx = j; }
                                }
                                leadersTx.push(bestTx);

                                let bestRx = 0, bestValRx = -1;
                                const uvec = svd.U[k];
                                for (let i = 0; i < uvec.length; i++) {
                                    const val = cAbs2(uvec[i]);
                                    if (val > bestValRx) { bestValRx = val; bestRx = i; }
                                }
                                leadersRx.push(bestRx);
                            }
                            return { leadersTx, leadersRx };
                        }

                        const { leadersTx, leadersRx } = pickLeadersFromSVD_local(svd);
                        const streamStrengths = svd.S.slice(0, r);

                        const txGroups = createDiversityGroupsWeakestFirst(numTx, r, leadersTx, streamStrengths);
                        const rxGroups = createDiversityGroupsWeakestFirst(numRx, r, leadersRx, streamStrengths);

                        const P_per_stream_var = P_total_var / r;
                        let trialCapacity = 0;

                        for (let s = 0; s < r; s++) {
                            const txSet = txGroups[s];
                            const rxSet = rxGroups[s];

                            let totalGain = 0;
                            for (const txIdx of txSet) {
                                for (const rxIdx of rxSet) {
                                    const c = H_trial[rxIdx][txIdx];
                                    if (!c) continue;
                                    totalGain += (c.real * c.real + c.imag * c.imag);
                                }
                            }

                            const snr = (P_per_stream_var * totalGain) / noiseVar;
                            trialCapacity += Math.log2(1 + snr);
                        }

                        totalCapacity += trialCapacity;
                    }

                    avgCapacity.push(totalCapacity / numTrials);
                }

                // Plot results
                plotOutageProbability('outageCanvas', thresholdRange_dB, outageProb, userThresholds);
                plotCapacity('capacityCanvas', snrRange_dB, avgCapacity);

                document.getElementById('runAnalysisBtn').textContent = 'Run Analysis';
                document.getElementById('runAnalysisBtn').disabled = false;
            }, 100);
        }

        function plotOutageProbability(canvasId, thresholdRange, outageProb, userThresholds) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');

            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;

            const padding = 60;
            const plotWidth = canvas.width - 2 * padding;
            const plotHeight = canvas.height - 2 * padding;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw axes
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();

            // Draw grid
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding + (plotHeight / 5) * i;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(canvas.width - padding, y);
                ctx.stroke();

                const x = padding + (plotWidth / 5) * i;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, canvas.height - padding);
                ctx.stroke();
            }

            const minThreshold = Math.min(...thresholdRange);
            const maxThreshold = Math.max(...thresholdRange);
            const yMax = 1.0;

            // Define colors for threshold markers (ADD THIS)
            const thresholdColors = ['#2DCE89', '#11CDEF', '#F7B924', '#8965E0', '#FB6340', '#5E72E4'];

            // Helper function to interpolate outage probability at a given SNR
            function interpolateOutage(targetSNR) {
                if (targetSNR < minThreshold || targetSNR > maxThreshold) return null;
                
                let i = 0;
                while (i < thresholdRange.length && thresholdRange[i] < targetSNR) i++;
                
                if (i === 0) return outageProb[0];
                if (i >= thresholdRange.length) return outageProb[outageProb.length - 1];
                
                const x0 = thresholdRange[i - 1], x1 = thresholdRange[i];
                const y0 = outageProb[i - 1], y1 = outageProb[i];
                const t = (targetSNR - x0) / (x1 - x0);
                return y0 + t * (y1 - y0);
            }

            // Plot main outage curve (should be INCREASING with threshold)
            ctx.strokeStyle = '#F5365C';
            ctx.lineWidth = 3;
            ctx.beginPath();

            thresholdRange.forEach((threshold, i) => {
                const x = padding + ((threshold - minThreshold) / (maxThreshold - minThreshold)) * plotWidth;
                const y = canvas.height - padding - (outageProb[i] / yMax) * plotHeight;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Remove the old label drawing code and replace with legend creation
            const legendContainer = document.getElementById('outageLegend');
            legendContainer.innerHTML = '';

            userThresholds.forEach((threshold, idx) => {
                if (threshold < minThreshold || threshold > maxThreshold) return;
                
                const color = thresholdColors[idx % thresholdColors.length];
                const snrX = padding + ((threshold - minThreshold) / (maxThreshold - minThreshold)) * plotWidth;
                
                const outageAtThreshold = interpolateOutage(threshold);
                if (outageAtThreshold === null) return;
                
                const outageY = canvas.height - padding - (outageAtThreshold / yMax) * plotHeight;
                
                // Draw vertical line
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(snrX, canvas.height - padding);
                ctx.lineTo(snrX, outageY);
                ctx.stroke();
                
                // Draw horizontal line
                ctx.beginPath();
                ctx.moveTo(padding, outageY);
                ctx.lineTo(snrX, outageY);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Mark intersection point
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(snrX, outageY, 5, 0, 2 * Math.PI);
                ctx.fill();
                
                // Create legend entry
                const legendEntry = document.createElement('div');
                legendEntry.className = 'legend-entry';
                legendEntry.innerHTML = `
                    <div class="legend-color" style="background-color: ${color};"></div>
                    <span class="legend-label">SNR = ${threshold.toFixed(1)} dB:</span>
                    <span class="legend-value">P<sub>outage</sub> = ${outageAtThreshold.toFixed(3)}</span>
                `;
                legendContainer.appendChild(legendEntry);
            });

            // Labels
            ctx.fillStyle = '#333';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('SNR Threshold (dB)', canvas.width / 2, canvas.height - 15);

            ctx.save();
            ctx.translate(20, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Outage Probability', 0, 0);
            ctx.restore();

            // Axis ticks
            ctx.font = '11px Arial';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            const thresholdTicks = 5;
            for (let i = 0; i <= thresholdTicks; i++) {
                const val = minThreshold + (maxThreshold - minThreshold) * i / thresholdTicks;
                const x = padding + plotWidth * i / thresholdTicks;
                ctx.fillText(val.toFixed(0), x, canvas.height - padding + 18);
            }

            ctx.textAlign = 'right';
            const yTicks = 5;
            for (let i = 0; i <= yTicks; i++) {
                const val = (i / yTicks) * yMax;
                const y = canvas.height - padding - (val / yMax) * plotHeight;
                ctx.fillText(val.toFixed(2), padding - 10, y + 4);
            }
        }

        // Keep the capacity plot function unchanged (it already plots vs SNR correctly)
        function plotCapacity(canvasId, snrRange, capacity) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
            const padding = 60;
            const plotWidth = canvas.width - 2 * padding;
            const plotHeight = canvas.height - 2 * padding;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw axes
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();
            
            // Draw grid
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding + (plotHeight / 5) * i;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(canvas.width - padding, y);
                ctx.stroke();
                
                const x = padding + (plotWidth / 5) * i;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, canvas.height - padding);
                ctx.stroke();
            }
            
            const minSNR = Math.min(...snrRange);
            const maxSNR = Math.max(...snrRange);
            const maxCap = Math.max(...capacity);
            
            // Plot curve
            ctx.strokeStyle = '#2DCE89';
            ctx.lineWidth = 3;
            ctx.beginPath();
            
            snrRange.forEach((snr, i) => {
                const x = padding + ((snr - minSNR) / (maxSNR - minSNR)) * plotWidth;
                const y = canvas.height - padding - (capacity[i] / maxCap) * plotHeight;
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            
            // Labels
            ctx.fillStyle = '#333';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('SNR (dB)', canvas.width / 2, canvas.height - 15);
            
            ctx.save();
            ctx.translate(20, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Capacity (bits/s/Hz)', 0, 0);
            ctx.restore();
            
            // Axis ticks
            ctx.font = '11px Arial';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            const snrTicks = 5;
            for (let i = 0; i <= snrTicks; i++) {
                const val = minSNR + (maxSNR - minSNR) * i / snrTicks;
                const x = padding + plotWidth * i / snrTicks;
                ctx.fillText(val.toFixed(0), x, canvas.height - padding + 18);
            }
            
            ctx.textAlign = 'right';
            const capStep = maxCap / 5;
            for (let i = 0; i <= 5; i++) {
                const val = i * capStep;
                const y = canvas.height - padding - (val / maxCap) * plotHeight;
                ctx.fillText(val.toFixed(1), padding - 10, y + 4);
            }
        }

        // Lightweight behavior for the card-style instructions
        (function() {
            const details = document.getElementById('instructionsCard');
            const summary = details.querySelector('summary');

            // Toggle aria-expanded for accessibility when the card is opened/closed
            details.addEventListener('toggle', () => {
                summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
            });

            // Close when pressing Escape while focused inside the instructions
            details.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') details.open = false;
            });

            // Keep chevron rotation in sync (in case CSS attribute selectors aren't supported)
            const chev = details.querySelector('.chev');
            const updateChev = () => {
                if (!chev) return;
                chev.style.transform = details.open ? 'rotate(225deg)' : 'rotate(45deg)';
            };
            details.addEventListener('toggle', updateChev);
            updateChev();

            // Optional: auto-scroll to top of card when opened on small screens
            details.addEventListener('toggle', () => {
                if (details.open && window.innerWidth < 700) details.scrollIntoView({behavior:'smooth', block:'start'});
            });
        })();
    
