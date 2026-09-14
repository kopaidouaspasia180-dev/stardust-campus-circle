begin;

-- This changes only the display name. The immutable tenant key and every
-- campus/business scope remain unchanged so existing data keeps its boundary.
update tenants set name='清华大学' where slug='tangshan';

commit;
