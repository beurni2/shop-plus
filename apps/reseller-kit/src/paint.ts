import { type as typo } from '@platform/ui-tokens';
import type { Card, Op } from './composeur';

/**
 * WO-7.2b — the dumb executor. It strokes a display list onto a 2D canvas at a
 * target width, scaling the whole composition (WYSIWYG: the preview and the full
 * output are the SAME ops at different scales). It decides nothing — every
 * position, colour and string was fixed, deterministically, by `composeCard`.
 */

const FONT_STACK = `${typo.family}, ${typo.familyFallback}`;

function drawOp(ctx: CanvasRenderingContext2D, op: Op): void {
  switch (op.kind) {
    case 'fill': {
      ctx.fillStyle = op.colour;
      ctx.fillRect(op.x, op.y, op.w, op.h);
      return;
    }
    case 'tick': {
      ctx.strokeStyle = op.colour;
      ctx.lineWidth = op.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      op.path.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      return;
    }
    case 'text': {
      ctx.fillStyle = op.colour;
      ctx.textAlign = op.align;
      ctx.textBaseline = 'top';
      ctx.font = `${op.weight} ${op.px}px ${FONT_STACK}`;
      ctx.fillText(op.text, op.x, op.y);
      return;
    }
    case 'qr': {
      ctx.fillStyle = op.light;
      ctx.fillRect(op.x, op.y, op.side, op.side);
      ctx.fillStyle = op.dark;
      for (let r = 0; r < op.matrix.length; r++) {
        const row = op.matrix[r]!;
        for (let c = 0; c < row.length; c++) {
          if (!row[c]) continue;
          ctx.fillRect(op.x + (c + op.quiet) * op.module, op.y + (r + op.quiet) * op.module, op.module, op.module);
        }
      }
      return;
    }
  }
}

/** Paint `card` onto `canvas` at `targetWidth` px (height follows the ratio). */
export function paint(canvas: HTMLCanvasElement, card: Card, targetWidth: number): void {
  const scale = targetWidth / card.width;
  canvas.width = Math.round(card.width * scale);
  canvas.height = Math.round(card.height * scale);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('reseller-kit: no 2D canvas context');
  ctx.save();
  ctx.scale(scale, scale);
  for (const op of card.ops) drawOp(ctx, op);
  ctx.restore();
}
