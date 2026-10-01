-- Original synthetic S2 fixtures. Centers are approximate, not licensed boundaries.
-- No real event feed is seeded. Never represent these records as live coverage.
insert into public.categories(code,names) values
 ('music','{"uk":"Музика й концерти","en":"Music and concerts","es":"Música y conciertos"}'),
 ('festivals','{"uk":"Фестивалі","en":"Festivals","es":"Festivales"}'),
 ('sport','{"uk":"Спорт","en":"Sport","es":"Deporte"}'),
 ('cinema','{"uk":"Кіно","en":"Cinema","es":"Cine"}'),
 ('theatre','{"uk":"Театр","en":"Theatre","es":"Teatro"}'),
 ('culture','{"uk":"Виставки й культура","en":"Exhibitions and culture","es":"Exposiciones y cultura"}'),
 ('family','{"uk":"Сімейні події","en":"Family events","es":"Eventos familiares"}'),
 ('food','{"uk":"Ярмарки й їжа","en":"Fairs and food","es":"Ferias y gastronomía"}'),
 ('learning','{"uk":"Навчання","en":"Learning","es":"Aprendizaje"}'),
 ('business','{"uk":"Бізнес","en":"Business","es":"Negocios"}'),
 ('other','{"uk":"Інше","en":"Other","es":"Otros"}');
insert into public.territories(id,country_code,external_id,kind,names,provenance,is_demo) values
 ('00000000-0000-4000-8000-000000000001','ES','demo:country:ES','country','{"uk":"Іспанія","en":"Spain","es":"España"}','Original synthetic fixture; no boundary data',true),
 ('00000000-0000-4000-8000-000000000002','UA','demo:country:UA','country','{"uk":"Україна","en":"Ukraine","es":"Ucrania"}','Original synthetic fixture; no boundary data',true);
insert into public.territories(country_code,external_id,kind,parent_id,names,center,provenance,is_demo) values
 ('ES','demo:city:madrid','city','00000000-0000-4000-8000-000000000001','{"uk":"Мадрид","en":"Madrid","es":"Madrid"}',extensions.st_setsrid(extensions.st_makepoint(-3.70,40.42),4326)::extensions.geography,'Original approximate demo center; no boundary or coverage claim',true),
 ('UA','demo:city:kyiv','city','00000000-0000-4000-8000-000000000002','{"uk":"Київ","en":"Kyiv","es":"Kyiv"}',extensions.st_setsrid(extensions.st_makepoint(30.52,50.45),4326)::extensions.geography,'Original approximate demo center; no boundary or coverage claim',true);
