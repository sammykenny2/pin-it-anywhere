/** Manual paper geometry in logical desktop units; existing placements are never normalized on load. */
export const resizeEdges = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const minimumPaperSize = Object.freeze({ width: 160, height: 160 });
export const sameRectangle = (a, b) => Boolean(a && b && ['x', 'y', 'width', 'height'].every(key => a[key] === b[key]));

export function resizeRectangle(origin, start, point, edge) {
  const dx = point.x - start.x, dy = point.y - start.y;
  const result = { ...origin, width: Math.max(minimumPaperSize.width, origin.width), height: Math.max(minimumPaperSize.height, origin.height) };
  if (edge.includes('e')) result.width = Math.max(minimumPaperSize.width, origin.width + dx);
  if (edge.includes('s')) result.height = Math.max(minimumPaperSize.height, origin.height + dy);
  if (edge.includes('w')) {
    result.width = Math.max(minimumPaperSize.width, origin.width - dx);
    result.x = origin.x + origin.width - result.width;
  }
  if (edge.includes('n')) {
    result.height = Math.max(minimumPaperSize.height, origin.height - dy);
    result.y = origin.y + origin.height - result.height;
  }
  return result;
}
