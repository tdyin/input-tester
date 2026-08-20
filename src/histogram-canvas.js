export function drawHistogram(canvas, bins) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 24;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, padding, chartWidth, chartHeight);

  const gap = 2;
  const barWidth = chartWidth / bins.length - gap;

  bins.forEach((bin, index) => {
    const x = padding + index * (barWidth + gap);
    const ratio = bin.count / maxCount;
    const barHeight = ratio * chartHeight;
    const y = padding + chartHeight - barHeight;
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(x, y, Math.max(1, barWidth), barHeight);
  });
}
