begin;

-- Public-platform references are shown separately from campus likes. They are
-- only used as a deterministic tie-break while genuine campus votes build up.
alter table ranking_places add column if not exists reference_source text not null default '';
alter table ranking_places add column if not exists reference_rating numeric(2,1);
alter table ranking_places add column if not exists reference_count integer not null default 0;
alter table ranking_places add column if not exists reference_url text not null default '';
alter table ranking_places add column if not exists editorial_rank integer not null default 999;

alter table ranking_places drop constraint if exists ranking_places_reference_rating_check;
alter table ranking_places add constraint ranking_places_reference_rating_check
  check(reference_rating is null or (reference_rating>=0 and reference_rating<=5));
alter table ranking_places drop constraint if exists ranking_places_reference_count_check;
alter table ranking_places add constraint ranking_places_reference_count_check check(reference_count>=0);
alter table ranking_places drop constraint if exists ranking_places_editorial_rank_check;
alter table ranking_places add constraint ranking_places_editorial_rank_check check(editorial_rank>0);

with verified(
  campus_slug,category,name,note,location,cover_key,reference_source,
  reference_rating,reference_count,reference_url,editorial_rank
) as (values
  ('huayanbeilu','food','钰姐妹饺子城','饺子和家常菜为主，公开平台评价量较多','华岩北路与朝阳西道交叉口北行200米路西','food-yu-sisters','Trip.com',4.8,202,'https://tw.trip.com/restaurant/china/tangshan/detail/restaurant-112004',1),
  ('huayanbeilu','food','锦色烤鸭·唐山菜·川菜（学院路店）','烤鸭、唐山菜和川菜，适合同学聚餐','学院路与长虹道交叉口北行200米路东','food-jinse-duck','Trip.com',4.5,17,'https://hk.trip.com/restaurant/china/tangshan/detail/restaurant-32492121/',2),
  ('daxuexidao','food','小松料理（卫国路店）','公开平台收录的唐山日料老店','卫国路金港国际底商','food-xiaosong','Trip.com',5.0,6,'https://tw.trip.com/restaurant/china/tangshan/detail/restaurant-15844603/',3),
  ('beiyuan','food','刘家大院烧烤','大学生公寓村东门附近的庭院烧烤','大学西道与华岩北路交叉口北行400米路西','food-liujia-bbq','Trip.com',5.0,1,'https://tw.trip.com/restaurant/china/tangshan/detail/restaurant-33600712/',4),
  ('huayanbeilu','food','必胜客（唐山吾悦广场店）','吾悦广场内的连锁披萨餐厅','学院北路与长宁西道交叉口唐山吾悦广场','food-pizzahut-wuyue','Trip.com',null,0,'https://hk.trip.com/restaurant/china/tangshan/detail/restaurant-130234840',5),
  ('daxuexidao','food','w两个世界咖啡奶茶（大学道店）','恒大学庭底商的咖啡奶茶店','恒大学庭313-101号','food-two-worlds','吉屋周边配套',null,0,'https://tangshan.jiwu.com/loupan/1303216.html',6),

  ('huayanbeilu','fun','远洋城','餐饮、购物、影院和休闲业态集中','建设北路与长宁道商圈','fun-yuanyang','唐山师范学院官方周边攻略',null,0,'https://zwx.tstc.edu.cn/info/1021/3742.htm',1),
  ('huayanbeilu','fun','唐山吾悦广场','餐饮、购物、影院和电玩城等业态集中','学院北路与长宁西道交叉口','fun-wuyue','唐山师范学院官方周边攻略',null,0,'https://zwx.tstc.edu.cn/info/1021/3742.htm',2),
  ('daxuexidao','fun','酷8台球俱乐部','唐山学院南院周边公开配套中的台球场所','大学西道校区南院周边','fun-cool8','城市吧周边配套',null,0,'https://tangshan.city8.com/education/8a3kt781ekg6be334c_address',3),
  ('daxuexidao','fun','唐山南湖景区','城市公共休闲景区，适合散步和拍照','唐山市路南区南湖区域','fun-nanhu','公开地图信息',null,0,'https://map.baidu.com/',4),
  ('daxuexidao','fun','唐山博物馆','城市文化展览场馆，适合室内参观','唐山市路北区龙泽南路','fun-museum','公开地图信息',null,0,'https://map.baidu.com/',5),

  ('daxuexidao','life','永鑫便利店（大学西道店）','校园周边日常补给便利店','大学西道42号','life-yongxin','吉屋周边配套',null,0,'https://tangshan.jiwu.com/loupan/1303216.html',1),
  ('daxuexidao','life','依达便利店（大学道店）','靠近大学西道校区的便利店','大学西道9号','life-yida','吉屋周边配套',null,0,'https://tangshan.jiwu.com/loupan/1303216.html',2),
  ('beiyuan','life','学苑眼镜（东店）','大学生公寓村附近的眼镜店','大学道159号','life-xueyuan-optical','吉屋周边配套',null,0,'https://tangshan.jiwu.com/loupan/1303216.html',3),
  ('daxuexidao','life','自然鲜果','恒大学庭周边水果店','恒大学庭周边','life-natural-fruit','吉屋周边配套',null,0,'https://tangshan.jiwu.com/loupan/1303216.html',4),
  ('beiyuan','life','润造型','大学生公寓村内的美发店','大学道大学公寓村8号楼2楼','life-run-hair','唐山本地宝',null,0,'https://ts.bendibao.com/wangdian/dian/4403639.shtm',5)
)
insert into ranking_places(
  tenant_slug,campus_slug,category,name,note,location,cover_key,source_type,status,
  base_likes,reference_source,reference_rating,reference_count,reference_url,editorial_rank
)
select
  'tangshan',verified.campus_slug,verified.category,verified.name,verified.note,
  verified.location,verified.cover_key,'curated','active',0,verified.reference_source,
  verified.reference_rating,verified.reference_count,verified.reference_url,verified.editorial_rank
from verified
join campus_sites sites on sites.tenant_slug='tangshan' and sites.slug=verified.campus_slug
on conflict(tenant_slug,category,(lower(trim(name)))) where status in ('pending','active')
do update set
  campus_slug=excluded.campus_slug,
  note=excluded.note,
  location=excluded.location,
  cover_key=excluded.cover_key,
  source_type='curated',
  status='active',
  base_likes=0,
  reference_source=excluded.reference_source,
  reference_rating=excluded.reference_rating,
  reference_count=excluded.reference_count,
  reference_url=excluded.reference_url,
  editorial_rank=excluded.editorial_rank,
  updated_at=now()
where ranking_places.source_type='curated';

update ranking_places
set reference_source='门店提供',reference_rating=null,reference_count=0,
    reference_url='',editorial_rank=6,updated_at=now()
where tenant_slug='tangshan' and cover_key='life-mocha-pro' and status='active';

commit;
