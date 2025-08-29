
        // Configuration globale
        const API_BASE_URL = 'http://probe2.lpz.ovh/query';
        // let currentData = null;
        // let currentMetadata = null;
        function formatIsoDate(date) {
            return date.toISOString().split('T')[0];
        }
        function transformDataForPlot(apiData, metadata) {
            const fn = eval(metadata.toUserUnit);
            return apiData.map(item => ({
                Date: new Date(item.d),
                Value: fn(item.v)
            })).filter(item => !isNaN(item.Value) && item.Value !== null);
        }
        function createPlot(data, metadata, id) {
            const chartDiv = document.getElementById(id);
            
            if (data.length === 0) {
                chartDiv.innerHTML = `<div class="error-message">No data!</div>`;
                return;
            }
            try {
                const plot = Plot.plot({
                    width: 240,
                    height: 100,
                    marginLeft: 0,
                    marginTop: 16,
                    marginBottom: 17,
                    x: {type: "time",tickFormat: "%d/%m %H:%M"},
                    y: {label: null, type: "linear",axis: "right", grid: true, nice: true},
                    marks: [
                        Plot.lineY(data, {x: "Date", y: "Value", stroke: "#4dc0e0"}),
                        // Plot.ruleX(data, Plot.pointerX({x: "Date", py: "Value", stroke: "red"})),
                        Plot.dot(data, Plot.pointerX({x: "Date", y: "Value", stroke: "red"})),
                        Plot.text(data, Plot.pointerX({
                            px: "Date", py: "Value", dy: -16,dx: 30,
                            frameAnchor: "top-right",
                            fontVariant: "tabular-nums",
                            text: (d) => ` ${d.Value} ${metadata.userUnit}`
                        })),
                        Plot.text(data, Plot.pointerX({
                            px: "Date", py: "Value", dy: -16,
                            frameAnchor: "top-left",
                            fontVariant: "tabular-nums",
                            text: (d) => `${Plot.formatIsoDate(d.Date)} `
                        }))
                    ]
                    });
                // Insertion du graphique
                chartDiv.innerHTML = '';
                chartDiv.appendChild(plot);
                
            } catch (error) {
                console.error('Erreur lors de la création du graphique:', error);
                chartDiv.innerHTML = `<div class="error-message">Erreur lors de la création du graphique: ${error.message}</div>`;
            }
        }

        /**
         * Charge les données depuis l'API
         */
        async function loadData(station, sensor, id, param) {
            const loadingText = document.getElementById('loadingText');
            try {
                const url = `${API_BASE_URL}/${station}/Raw/${sensor}?${param}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
                }
                const apiResponse = await response.json();
                console.log('URL de l\'API:', url, apiResponse);
                if (!apiResponse.success) {
                    throw new Error(apiResponse.message || 'Erreur inconnue de l\'API');
                }
                // currentData = apiResponse.data;
                // currentMetadata = apiResponse.metadata;
                // Transformation et affichage
                const plotData = transformDataForPlot(apiResponse.data, apiResponse.metadata);
                createPlot(plotData, apiResponse.metadata, id);
            } catch (error) {
                console.error('Erreur lors du chargement:', error);
            }
        }