function openPart(evt, name) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
      tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
      tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(name).style.display = "block";
    evt.currentTarget.className += " active";
}

function startup() {
    document.getElementById("default").click();
}

window.onload = startup;

        let txElements = [];
        let rxElements = [];
        let tradeoffPoints = [];
        
        let isOptimizedDiagramView = false;
        let lastCalculatedMultiplexingGain_r = 0; 
                
        const txAntennasInput = document.getElementById('txAntennas');
        const rxAntennasInput = document.getElementById('rxAntennas');
        const modeSelect = document.getElementById('mode');
        const fixedValueInput = document.getElementById('fixedValue');
        const fixedValueLabel = document.getElementById('fixedValueLabel');
        const generateButton = document.getElementById('generateButton');
        const optimizeButton = document.getElementById('optimizeButton');
        
        const systemDiagramCard = document.getElementById('systemDiagramCard');
        const tradeoffCurveCard = document.getElementById('tradeoffCurveCard'); 
                
        const maxDiversitySpan = document.getElementById('maxDiversity');
        const maxMultiplexingSpan = document.getElementById('maxMultiplexing');
        const operatingRSpan = document.getElementById('operatingR');
        const operatingDSpan = document.getElementById('operatingD');
        const explanation1 = document.getElementById('explanation1');
        const explanation2 = document.getElementById('explanation2');
                
        const signalCanvas = document.getElementById('signalCanvas'); 
        const tradeoffChartEl = document.getElementById('tradeoffChart'); 
        const tradeoffCtx = tradeoffChartEl.getContext('2d');
                
        generateButton.addEventListener('click', function () {
            console.log("Generate button clicked. Setting isOptimizedDiagramView to false."); // DEBUG
            isOptimizedDiagramView = false; 
            updateSystem();
            systemDiagramCard.style.display = 'block'; 
            tradeoffCurveCard.style.display = 'block'; 
            optimizeButton.style.display = 'inline-block'; 
        });

        optimizeButton.addEventListener('click', function () {
            console.log("Optimize button clicked. Setting isOptimizedDiagramView to true."); // DEBUG
            isOptimizedDiagramView = true; 
            optimizeSystemConnections(); 
        });
                
        modeSelect.addEventListener('change', function() {
            updateFixedValueLabel();
            let currentVal = parseFloat(fixedValueInput.value);
            let minVal = parseFloat(fixedValueInput.min);
            let maxVal = parseFloat(fixedValueInput.max);
            if (currentVal < minVal) fixedValueInput.value = fixedValueInput.min;
            if (currentVal > maxVal) fixedValueInput.value = fixedValueInput.max;
            
            console.log("Mode changed. Setting isOptimizedDiagramView to false."); // DEBUG
            isOptimizedDiagramView = false;
            updateSystem(); 
        });

        txAntennasInput.addEventListener('change', () => {
            if (modeSelect.value === 'diversity') {
                 updateFixedValueLabel();
            }
            console.log("Tx Antennas changed. Setting isOptimizedDiagramView to false."); // DEBUG
            isOptimizedDiagramView = false; 
            updateSystem();
        });
        rxAntennasInput.addEventListener('change', () => {
            if (modeSelect.value === 'diversity') {
                 updateFixedValueLabel();
            }
            console.log("Rx Antennas changed. Setting isOptimizedDiagramView to false."); // DEBUG
            isOptimizedDiagramView = false; 
            updateSystem();
        });

        window.addEventListener('resize', function() {
            if (tradeoffCurveCard.style.display !== 'none') {
                tradeoffChartEl.width = tradeoffChartEl.offsetWidth;
                tradeoffChartEl.height = 350; 
                renderTradeoffChart();
            }
            
            if (systemDiagramCard.style.display !== 'none' && txElements.length > 0 && rxElements.length > 0) {
                signalCanvas.width = signalCanvas.parentElement.offsetWidth;
                signalCanvas.height = signalCanvas.parentElement.offsetHeight;
                const ctx = signalCanvas.getContext('2d');
                ctx.clearRect(0, 0, signalCanvas.width, signalCanvas.height);
                
                console.log("Window resize drawing. isOptimizedDiagramView:", isOptimizedDiagramView); // DEBUG
                if (isOptimizedDiagramView) {
                    drawOptimizedConnections(txElements, rxElements, ctx, lastCalculatedMultiplexingGain_r);
                } else {
                    drawChannelConnections(txElements, rxElements, ctx);
                }
            }
        });

        function init() {
            updateFixedValueLabel(); 
            isOptimizedDiagramView = false; 
            updateSystem(); 
            systemDiagramCard.style.display = 'block'; 
            tradeoffCurveCard.style.display = 'block'; 
            optimizeButton.style.display = 'inline-block';
        }

        function optimizeSystemConnections() {
            const Nt = parseInt(txAntennasInput.value);
            const Nr = parseInt(rxAntennasInput.value);
            const mode = modeSelect.value;
            let fixedVal = parseFloat(fixedValueInput.value);
            let m_multiplexing_gain; 

            if (mode === 'multiplexing') {
                m_multiplexing_gain = fixedVal;
            } else { 
                let d_val = fixedVal;
                const max_d = Nt * Nr;
                d_val = Math.max(0, Math.min(d_val, max_d));
                if (d_val > max_d || Math.pow(Nt - Nr, 2) + 4 * d_val < 0) { 
                    m_multiplexing_gain = 0;
                } else {
                    const term_under_sqrt = Math.pow(Nt - Nr, 2) + 4 * d_val;
                    m_multiplexing_gain = ( (Nt + Nr) - Math.sqrt(term_under_sqrt) ) / 2;
                }
                m_multiplexing_gain = Math.max(0, Math.min(m_multiplexing_gain, Math.min(Nt, Nr)));
            }
            m_multiplexing_gain = Math.max(0, m_multiplexing_gain); 
            lastCalculatedMultiplexingGain_r = m_multiplexing_gain; 

            const ctx = signalCanvas.getContext('2d');
            ctx.clearRect(0, 0, signalCanvas.width, signalCanvas.height);
            drawOptimizedConnections(txElements, rxElements, ctx, lastCalculatedMultiplexingGain_r);
        }

        function drawOptimizedConnections(currentTxElements, currentRxElements, ctx, multiplexingStreams_r) {
            console.log(`drawOptimizedConnections called. Streams (r): ${multiplexingStreams_r.toFixed(1)}. Tx count: ${currentTxElements.length}, Rx count: ${currentRxElements.length}`); //DEBUG
            ctx.strokeStyle = '#ff8c00'; 
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]); 
            const numStreamsInt = Math.round(multiplexingStreams_r); 

            for (let i = 0; i < numStreamsInt; i++) {
                if (i < currentTxElements.length && i < currentRxElements.length) {
                    const tx = currentTxElements[i];
                    const rx = currentRxElements[i];
                    drawConnection(tx, rx, ctx, `Opt-Mux[${i}]`);
                }
            }

            ctx.strokeStyle = '#3b82f6'; 
            ctx.setLineDash([3, 3]);
            const startDiversityIndex = numStreamsInt;
            for (let i = startDiversityIndex; i < Math.min(currentTxElements.length, currentRxElements.length); i++) {
                 if (i < currentTxElements.length && i < currentRxElements.length) { 
                    const tx = currentTxElements[i];
                    const rx = currentRxElements[i];
                     drawConnection(tx, rx, ctx, `Opt-Div[${i}]`);
                }
            }
             ctx.setLineDash([]); 
        }

        function drawConnection(tx, rx, ctx, label = "unlabeled") { 
            if (!tx || !rx) {
                console.warn(`drawConnection (${label}): Bailed, tx or rx is null/undefined.`); // DEBUG
                return;
            }
            const canvasRect = ctx.canvas.getBoundingClientRect(); 
            const txRect = tx.getBoundingClientRect();
            const rxRect = rx.getBoundingClientRect();

            if (txRect.width === 0 && txRect.height === 0 && txRect.x === 0 && txRect.y === 0) {
                console.warn(`drawConnection (${label}): Bailed, Tx element seems unrendered/invisible. txRect:`, JSON.stringify(txRect)); // DEBUG
                return;
            }
            if (rxRect.width === 0 && rxRect.height === 0 && rxRect.x === 0 && rxRect.y === 0) {
                console.warn(`drawConnection (${label}): Bailed, Rx element seems unrendered/invisible. rxRect:`, JSON.stringify(rxRect)); // DEBUG
                return;
            }

            const txX = txRect.left + txRect.width / 2 - canvasRect.left;
            const txY = txRect.top + txRect.height / 2 - canvasRect.top;
            const rxX = rxRect.left + rxRect.width / 2 - canvasRect.left;
            const rxY = rxRect.top + rxRect.height / 2 - canvasRect.top;

            // Uncomment for very verbose coordinate logging:
            // console.log(`drawConnection (${label}): Drawing from (${txX.toFixed(1)}, ${txY.toFixed(1)}) to (${rxX.toFixed(1)}, ${rxY.toFixed(1)}) | txRect: L${txRect.left.toFixed(0)} T${txRect.top.toFixed(0)} W${txRect.width.toFixed(0)} H${txRect.height.toFixed(0)} | canvasRect: L${canvasRect.left.toFixed(0)} T${canvasRect.top.toFixed(0)}`);

            ctx.beginPath();
            ctx.moveTo(txX, txY);
            ctx.lineTo(rxX, rxY);
            ctx.stroke();
        }

        function updateFixedValueLabel() {
            const Nt = parseInt(txAntennasInput.value);
            const Nr = parseInt(rxAntennasInput.value);
            if (modeSelect.value === 'multiplexing') {
                fixedValueLabel.textContent = 'Fixed Rate (R)';
                fixedValueInput.min = '0'; 
                fixedValueInput.max=8;
                // fixedValueInput.max = Math.min(Nt, Nr).toString(); 
                fixedValueInput.step = '0.1';
                if (parseFloat(fixedValueInput.value) > Math.min(Nt,Nr) || parseFloat(fixedValueInput.value) < 0 ) {
                    fixedValueInput.value = Math.max(0, Math.min(parseFloat(fixedValueInput.value), Math.min(Nt,Nr))).toString();
                }
            } else { 
                fixedValueLabel.textContent = 'Fixed Diversity Gain (d)';
                fixedValueInput.min = '0';
                fixedValueInput.max = (Nt * Nr).toString(); 
                fixedValueInput.step = '0.1';
                 if (parseFloat(fixedValueInput.value) > (Nt*Nr) || parseFloat(fixedValueInput.value) < 0) {
                    fixedValueInput.value = Math.max(0, Math.min(parseFloat(fixedValueInput.value), (Nt*Nr))).toString();
                }
            }
        }
                
        function updateSystem() {
            console.log("--- updateSystem called ---"); // DEBUG
            const Nt = parseInt(txAntennasInput.value);
            const Nr = parseInt(rxAntennasInput.value);
            const mode = modeSelect.value;
            const fixedValue = parseFloat(fixedValueInput.value);
            
            renderAntennas(Nt, Nr); 
            calculateTradeoffCurve(Nt, Nr, mode, fixedValue); 
            updateExplanation(Nt, Nr, mode, fixedValue);

            if (tradeoffCurveCard.style.display !== 'none') {
                tradeoffChartEl.width = tradeoffChartEl.offsetWidth;
                tradeoffChartEl.height = 350; 
                renderTradeoffChart();
            }
            if (systemDiagramCard.style.display !== 'none') {
                signalCanvas.width = signalCanvas.parentElement.offsetWidth;
                signalCanvas.height = signalCanvas.parentElement.offsetHeight;
                
                const ctx = signalCanvas.getContext('2d');
                ctx.clearRect(0, 0, signalCanvas.width, signalCanvas.height); 
                
                console.log("updateSystem drawing. isOptimizedDiagramView:", isOptimizedDiagramView); // DEBUG
                if (isOptimizedDiagramView) { 
                    drawOptimizedConnections(txElements, rxElements, ctx, lastCalculatedMultiplexingGain_r);
                } else {
                    drawChannelConnections(txElements, rxElements, ctx);
                }
            }
             console.log("--- updateSystem finished ---"); // DEBUG
        }
        
        function renderAntennas(numTx, numRx) {
            console.log(`renderAntennas called with numTx: ${numTx}, numRx: ${numRx}`); // DEBUG
            const txColumn = document.getElementById('txColumn');
            const rxColumn = document.getElementById('rxColumn');
            
            txColumn.innerHTML = '';
            rxColumn.innerHTML = '';
            
            txElements = []; 
            rxElements = []; 
            
            for (let i = 0; i < numTx; i++) {
                const antenna = document.createElement('div');
                antenna.className = 'antenna';
                txColumn.appendChild(antenna);
                txElements.push(antenna);
            }
            
            for (let i = 0; i < numRx; i++) {
                const antenna = document.createElement('div');
                antenna.className = 'antenna';
                rxColumn.appendChild(antenna);
                rxElements.push(antenna);
            }
            console.log(`renderAntennas finished. txElements count: ${txElements.length}, rxElements count: ${rxElements.length}`); // DEBUG
        }
                
        function drawChannelConnections(currentTxElements, currentRxElements, ctx) {
            console.log(`drawChannelConnections called. Tx count: ${currentTxElements.length}, Rx count: ${currentRxElements.length}`); // DEBUG
            if (!currentTxElements || !currentRxElements || currentTxElements.length === 0 || currentRxElements.length === 0) {
                console.log("drawChannelConnections: No elements to draw or empty arrays."); // DEBUG
                return;
            }

            ctx.strokeStyle = '#3b82f6'; 
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); 

            currentTxElements.forEach((tx, txIndex) => { 
                currentRxElements.forEach((rx, rxIndex) => { 
                    console.log(`drawChannelConnections: Attempting to connect Tx[${txIndex}] to Rx[${rxIndex}]`); // DEBUG
                    drawConnection(tx, rx, ctx, `AllToAll:Tx[${txIndex}]-Rx[${rxIndex}]`); 
                });
            });
            ctx.setLineDash([]); 
        }
                
        function calculateTradeoffCurve(Nt, Nr, mode, fixedValue) { /* ... (unchanged, kept for completeness) ... */
            const minAntennas = Math.min(Nt, Nr);
            const points = [];
            for (let r_iter = 0; r_iter <= minAntennas; r_iter += 0.05) { 
                r_iter = parseFloat(r_iter.toFixed(2)); 
                const d_val = (Nt - r_iter) * (Nr - r_iter);
                points.push({ multiplexingGain: r_iter, diversityGain: Math.max(0, d_val) });
            }
             if (minAntennas > 0 && (points.length === 0 || points[points.length-1].multiplexingGain < minAntennas)) {
                const d_at_max_r = (Nt - minAntennas) * (Nr - minAntennas);
                points.push({ multiplexingGain: minAntennas, diversityGain: Math.max(0, d_at_max_r) });
            }
            tradeoffPoints = points;
            maxDiversitySpan.textContent = (Nt * Nr).toFixed(1);
            maxMultiplexingSpan.textContent = minAntennas.toFixed(1);
            if (mode === 'multiplexing') {
                let r_op = Math.max(0, Math.min(fixedValue, minAntennas)); 
                operatingRSpan.textContent = r_op.toFixed(1);
                const diversityGain = (Nt - r_op) * (Nr - r_op);
                operatingDSpan.textContent = Math.max(0, diversityGain).toFixed(1);
            } else { 
                let d_op = Math.max(0, Math.min(fixedValue, Nt * Nr)); 
                operatingDSpan.textContent = d_op.toFixed(1);
                let r_calc;
                const term_under_sqrt = Math.pow(Nt - Nr, 2) + 4 * d_op;
                if (term_under_sqrt < 0) { r_calc = 0; } 
                else { r_calc = ( (Nt + Nr) - Math.sqrt(term_under_sqrt) ) / 2; }
                r_calc = Math.max(0, Math.min(r_calc, minAntennas)); 
                operatingRSpan.textContent = r_calc.toFixed(1);
            }
        }
        function renderTradeoffChart() { /* ... (unchanged, kept for completeness) ... */
            if (tradeoffPoints.length === 0) return;
            const width = tradeoffChartEl.width;
            const height = tradeoffChartEl.height;
            const padding = 50; 
            tradeoffCtx.clearRect(0, 0, width, height);
            const Nt = parseInt(txAntennasInput.value);
            const Nr = parseInt(rxAntennasInput.value);
            const minAntennas = Math.min(Nt, Nr);
            const maxMultiplexingOnAxis = Math.max(1, minAntennas === 0 ? 1 : minAntennas);
            const maxDiversityOnAxis = Math.max(1, (Nt * Nr) === 0 ? 1 : (Nt*Nr) );
            tradeoffCtx.strokeStyle = '#000';
            tradeoffCtx.lineWidth = 1; 
            tradeoffCtx.beginPath();
            tradeoffCtx.moveTo(padding, height - padding);
            tradeoffCtx.lineTo(width - padding, height - padding); 
            tradeoffCtx.moveTo(padding, height - padding);
            tradeoffCtx.lineTo(padding, padding); 
            tradeoffCtx.stroke();
            tradeoffCtx.fillStyle = '#333';
            tradeoffCtx.font = '12px Arial';
            tradeoffCtx.textAlign = 'center';
            tradeoffCtx.fillText('Multiplexing Gain (r)', width / 2, height - padding + 30);
            tradeoffCtx.save();
            tradeoffCtx.translate(padding - 35, height / 2);
            tradeoffCtx.rotate(-Math.PI / 2);
            tradeoffCtx.fillText('Diversity Gain (d)', 0, 0);
            tradeoffCtx.restore();
            tradeoffCtx.strokeStyle = '#3b82f6';
            tradeoffCtx.lineWidth = 2;
            tradeoffCtx.beginPath();
            tradeoffPoints.forEach((point, i) => {
                const x = padding + (point.multiplexingGain / maxMultiplexingOnAxis) * (width - 2 * padding);
                const y = height - padding - (point.diversityGain / maxDiversityOnAxis) * (height - 2 * padding);
                if (i === 0) tradeoffCtx.moveTo(x, y);
                else tradeoffCtx.lineTo(x, y);
            });
            tradeoffCtx.stroke();
            tradeoffCtx.fillStyle = '#000';
            tradeoffCtx.font = '10px Arial';
            tradeoffCtx.textAlign = 'center';
            tradeoffCtx.textBaseline = 'top';
            let xTickStep = maxMultiplexingOnAxis <= 1 ? 0.2 : (maxMultiplexingOnAxis <= 2 ? 0.5 : (maxMultiplexingOnAxis <=5 ? 1 : Math.round(maxMultiplexingOnAxis/5 * 10)/10));
            xTickStep = Math.max(0.1, xTickStep);
            for (let i = 0; i <= maxMultiplexingOnAxis + 1e-9; i += xTickStep) { 
                const x = padding + (i / maxMultiplexingOnAxis) * (width - 2 * padding);
                tradeoffCtx.fillText(i.toFixed(xTickStep < 1 ? 1:0), x, height - padding + 5);
                tradeoffCtx.beginPath();
                tradeoffCtx.moveTo(x, height - padding - 3);
                tradeoffCtx.lineTo(x, height - padding + 3);
                tradeoffCtx.stroke();
            }
            if (maxMultiplexingOnAxis > 0 && (maxMultiplexingOnAxis % xTickStep !== 0 || xTickStep === 0) && Math.abs(maxMultiplexingOnAxis - Math.floor(maxMultiplexingOnAxis/xTickStep)*xTickStep) > 1e-9 ) { 
                const x_last = padding + (width - 2 * padding);
                tradeoffCtx.fillText(maxMultiplexingOnAxis.toFixed(maxMultiplexingOnAxis % 1 === 0 ? 0:1), x_last, height - padding + 5);
                tradeoffCtx.beginPath();
                tradeoffCtx.moveTo(x_last, height - padding - 3);
                tradeoffCtx.lineTo(x_last, height - padding + 3);
                tradeoffCtx.stroke();
            }
            tradeoffCtx.textAlign = 'right';
            tradeoffCtx.textBaseline = 'middle';
            let yTickStep = maxDiversityOnAxis <= 1 ? 0.2 :(maxDiversityOnAxis <= 5 ? 1 : Math.ceil(maxDiversityOnAxis / 5));
            yTickStep = Math.max(0.1, yTickStep); 
            for (let i = 0; i <= maxDiversityOnAxis + 1e-9; i += yTickStep) {
                const y = height - padding - (i / maxDiversityOnAxis) * (height - 2 * padding);
                tradeoffCtx.fillText(i.toFixed(yTickStep < 1 ? 1:0), padding - 8, y);
                tradeoffCtx.beginPath();
                tradeoffCtx.moveTo(padding - 3, y);
                tradeoffCtx.lineTo(padding + 3, y);
                tradeoffCtx.stroke();
            }
             if (maxDiversityOnAxis > 0 && (maxDiversityOnAxis % yTickStep !== 0 || yTickStep === 0) && Math.abs(maxDiversityOnAxis - Math.floor(maxDiversityOnAxis/yTickStep)*yTickStep) > 1e-9) {
                const y_last = padding; 
                tradeoffCtx.fillText(maxDiversityOnAxis.toFixed(maxDiversityOnAxis % 1 === 0 ? 0:1), padding - 8, y_last);
                tradeoffCtx.beginPath();
                tradeoffCtx.moveTo(padding - 3, y_last);
                tradeoffCtx.lineTo(padding + 3, y_last);
                tradeoffCtx.stroke();
            }
            const operatingR = parseFloat(operatingRSpan.textContent);
            const operatingD = parseFloat(operatingDSpan.textContent);
            if (!isNaN(operatingR) && !isNaN(operatingD) && maxMultiplexingOnAxis > 0 && maxDiversityOnAxis > 0) {
                const x = padding + (operatingR / maxMultiplexingOnAxis) * (width - 2 * padding);
                const y = height - padding - (operatingD / maxDiversityOnAxis) * (height - 2 * padding);
                tradeoffCtx.fillStyle = '#ef4444'; 
                tradeoffCtx.beginPath();
                tradeoffCtx.arc(x, y, 5, 0, 2 * Math.PI);
                tradeoffCtx.fill();
            }
        }
        function updateExplanation(Nt, Nr, mode, fixedValue) { /* ... (unchanged, kept for completeness) ... */
            const minAntennas = Math.min(Nt, Nr);
            const maxDiversityVal = Nt * Nr;
            const maxMultiplexingVal = minAntennas;
            explanation1.textContent = `The diversity-multiplexing tradeoff (DMT) shows the fundamental relationship between reliability (diversity gain) 
                and data rate (multiplexing gain) in MIMO wireless systems. For a ${Nt}×${Nr} MIMO system, the 
                maximum diversity gain is ${maxDiversityVal.toFixed(1)} and the maximum multiplexing gain is ${maxMultiplexingVal.toFixed(1)}.`;
            if (mode === 'multiplexing') {
                let r_exp = Math.max(0, Math.min(fixedValue, minAntennas));
                let d_exp = (Nt - r_exp) * (Nr - r_exp);
                explanation2.textContent = `With fixed multiplexing gain r = ${r_exp.toFixed(1)}, the achievable diversity gain is approximately ${Math.max(0, d_exp).toFixed(1)}.`;
            } else { 
                let d_exp = Math.max(0, Math.min(fixedValue, maxDiversityVal));
                let r_calc_exp;
                const term_under_sqrt_exp = Math.pow(Nt - Nr, 2) + 4 * d_exp;
                if (term_under_sqrt_exp < 0) { r_calc_exp = 0; } 
                else { r_calc_exp = ( (Nt + Nr) - Math.sqrt(term_under_sqrt_exp) ) / 2; }
                r_calc_exp = Math.max(0, Math.min(r_calc_exp, minAntennas));
                explanation2.textContent = `With fixed diversity gain d = ${d_exp.toFixed(1)}, the achievable multiplexing gain is approximately ${r_calc_exp.toFixed(1)}.`;
            }
        }
                
        init();