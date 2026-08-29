import type { Request, Response } from 'express';

export function createRequestAbortController(req: Request, res: Response) {
  const controller = new AbortController();

  const abort = () => {
    if (!controller.signal.aborted && !res.writableEnded) {
      controller.abort();
    }
  };

  req.once('aborted', abort);
  res.once('close', abort);

  return {
    signal: controller.signal,
    cleanup() {
      req.off('aborted', abort);
      res.off('close', abort);
    },
  };
}
