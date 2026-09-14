begin;

-- Keep the immutable tenant key and all campus/business boundaries unchanged;
-- only restore the public display name used by the client and operations API.
update tenants set name='唐山学院' where slug='tangshan';

commit;
