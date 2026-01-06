-- Supabase SQL: 현장 부적합 입력 데이터 테이블 생성
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS field_reports (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  branch_id INTEGER NOT NULL,
  
  -- 카테고리 및 항목
  category TEXT NOT NULL,      -- 주차구역, 턱 낮추기, 경사로 등
  item_name TEXT NOT NULL,     -- 주차구역 폭, 턱 높이 등
  
  -- 위치 정보
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  
  -- 측정 데이터 (JSON 형식)
  measurements JSONB NOT NULL,  -- { "측정값": "150", "폭": "200" } 등
  
  -- 메모
  memo TEXT,
  
  -- 사진 (향후 추가 예정)
  photos TEXT[],
  
  -- 시간
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_field_reports_user ON field_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_field_reports_branch ON field_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_field_reports_category ON field_reports(category);
CREATE INDEX IF NOT EXISTS idx_field_reports_created ON field_reports(created_at DESC);

-- RLS (Row Level Security) 설정
ALTER TABLE field_reports ENABLE ROW LEVEL SECURITY;

-- 정책: 자기 지회 데이터만 읽기/쓰기 가능
CREATE POLICY "Users can view their branch reports"
  ON field_reports FOR SELECT
  USING (true); -- 일단 모두 읽기 가능 (나중에 branch_id로 제한 가능)

CREATE POLICY "Users can insert their reports"
  ON field_reports FOR INSERT
  WITH CHECK (true); -- 일단 모두 쓰기 가능

CREATE POLICY "Users can update their reports"
  ON field_reports FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their reports"
  ON field_reports FOR DELETE
  USING (true);

-- 자동 updated_at 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_field_reports_updated_at
  BEFORE UPDATE ON field_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 완료!
SELECT 'field_reports 테이블 생성 완료!' AS status;
