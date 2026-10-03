-- SQL CHECK must explicitly reject NULL identifiers rather than accepting UNKNOWN.
alter table public.s9_config add constraint s9_enabled_configuration check(not enabled or (
 entitlement_id is not null and length(trim(entitlement_id))>0
 and cardinality(product_ids)>0 and cardinality(app_ids)>0
 and array_position(product_ids,null) is null and array_position(app_ids,null) is null
 and array_position(product_ids,'') is null and array_position(app_ids,'') is null
));
