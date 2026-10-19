-- 空账号组的引导偏好与里程碑独立保存，不迁入任意平台账号的状态。
CREATE TABLE IF NOT EXISTS group_onboarding_states (
 user_id text NOT NULL,
 group_id text NOT NULL,
 origin text CHECK(origin IN ('fresh','existing')),
 hidden boolean NOT NULL DEFAULT false,
 collapsed boolean NOT NULL DEFAULT true,
 completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(completed_steps)='array'),
 updated_at text NOT NULL,
 PRIMARY KEY(user_id,group_id)
);
