import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

/**
 * Validate a request against a Zod schema and REPLACE the raw input with the
 * parsed result.
 *
 * The replacement is the important half. Handlers downstream read
 * `req.body` / `req.query` and get coerced, trimmed, defaulted, type-safe
 * values — and, critically, only the fields the schema declares. A caller who
 * posts `{ role: "admin" }` to the profile endpoint has that key stripped here,
 * before any handler can pass it to an UPDATE.
 */
/**
 * `ZodTypeAny`, not `ZodSchema<T>`. A schema built with `.transform()` — which
 * is most of ours, since query params arrive as strings and get coerced — has an
 * INPUT type distinct from its OUTPUT type. `ZodSchema<T>` collapses the two and
 * rejects every such schema at the call site.
 */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    /**
     * `safeParse`, deliberately NOT `parse` + `catch (err) { if (err instanceof ZodError) }`.
     *
     * `instanceof` compares constructor identity, which only holds when both
     * sides resolved the SAME copy of zod. The schemas come from @cch/shared,
     * this file imports zod itself, and the moment those two resolve different
     * module instances — a nested node_modules, a bundler realm, a test runner's
     * transform — `err instanceof ZodError` is silently false. The validation
     * error then falls through to the generic handler and every bad request
     * returns 500 instead of 400.
     *
     * That is exactly what happened here, and only an executed request revealed
     * it. `safeParse` returns the error as a value, so there is no cross-realm
     * identity check to get wrong.
     */
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(badRequest('Please check the highlighted fields', details));
    }

    if (source === 'query') {
      // Express 5 makes req.query a getter, so plain assignment would throw.
      // Defining the property outright works on both 4 and 5.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
      });
    } else {
      req[source] = result.data as never;
    }

    next();
  };
}

export const validateBody = <S extends ZodTypeAny>(schema: S) => validate(schema, 'body');
export const validateQuery = <S extends ZodTypeAny>(schema: S) => validate(schema, 'query');
export const validateParams = <S extends ZodTypeAny>(schema: S) => validate(schema, 'params');
