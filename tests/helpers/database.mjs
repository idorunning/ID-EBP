import {PGlite as Base} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
export class PGlite extends Base { constructor(options={}){super({...options,extensions:{vector,pg_trgm,unaccent,...options.extensions}});} }
