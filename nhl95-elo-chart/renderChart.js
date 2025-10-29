export async function renderChart(games, datasets, filename='league_elo_history.png', linearXAxis=false) {
  const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
  const fs = await import('fs');

  const width = 1400;
  const height = 700;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: 'line',
    data: { datasets },
    options: {
      plugins: {
        legend: { display: true, position: 'right' },
        title: { display: true, text: 'Manager ELO History', font: { size: 20 } }
      },
      scales: {
        x: {
          type: linearXAxis ? 'linear' : 'category', // <--- set linear if requested
          title: { display: true, text: 'Game #' },
          ticks: { maxTicksLimit: 20 }
        },
        y: { title: { display: true, text: 'ELO' } }
      },
      responsive: true
    }
  };

  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(filename, image);
  console.log(`Chart saved as ${filename}`);
}
