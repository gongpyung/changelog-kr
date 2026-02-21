-- ChangeLog.kr User Check-in Schema
-- Run this in Supabase SQL Editor

-- 사용자 확인 기록 테이블
CREATE TABLE IF NOT EXISTS user_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  last_checked_version TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_checkins_user_id ON user_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_checkins_service_id ON user_checkins(service_id);

-- RLS (Row Level Security) 활성화
ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 확인 기록만 볼 수 있음
CREATE POLICY "Users can view own checkins" ON user_checkins
  FOR SELECT USING (auth.uid() = user_id);

-- 사용자는 자신의 확인 기록만 추가할 수 있음
CREATE POLICY "Users can insert own checkins" ON user_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 사용자는 자신의 확인 기록만 수정할 수 있음
CREATE POLICY "Users can update own checkins" ON user_checkins
  FOR UPDATE USING (auth.uid() = user_id);

-- 사용자는 자신의 확인 기록만 삭제할 수 있음
CREATE POLICY "Users can delete own checkins" ON user_checkins
  FOR DELETE USING (auth.uid() = user_id);
