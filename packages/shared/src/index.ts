/**
 * @cch/shared — the contract between apps/api and apps/web.
 *
 * Import validation schemas and types from here on BOTH sides. If a shape is
 * defined anywhere else, it can drift; defined here, it cannot.
 */

export * from './constants';

export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/student';
export * from './schemas/taxonomy';
export * from './schemas/job';
export * from './schemas/application';
export * from './schemas/notification';
export * from './schemas/content';
export * from './schemas/settings';
export * from './schemas/analytics';
