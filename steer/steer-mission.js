/*
 * Steer 조합 엔진 v0.2
 * 용신 결과(SteerSaju.compute) → 6항목 선택지 → 조합 결과
 *
 *   오행이 정하는 것 : 색 · 맛 · 방위 · 시간 · 공간   (무엇으로)
 *   십성이 정하는 것 : 행위                         (무엇을)
 *
 * 각 항목은 용신 버전과 희신 버전 두 가지 선택지를 가진다.
 * 공간은 이대 정문 반경 2km 실제 장소(steer-spaces.js의 STEER_SPACES). 없으면 유형으로 대체.
 * 방위는 '지금 있는 곳 기준'이라 공간(이대 근처 특정 장소)과 함께 고를 수 없다.
 *
 * 사용:
 *   const r = SteerSaju.compute({...});
 *   const opts = SteerMission.options(r);            // 항목별 선택지
 *   const res  = SteerMission.compose(r, picks);     // picks: { color:'용신'|'희신', ... }
 *   const lim  = SteerMission.limit(r);               // 오늘 고를 수 있는 최대 개수 (일진 기준)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SteerMission = factory();
})(this, function () {

  const ITEMS = ['color', 'taste', 'direction', 'time', 'space', 'action'];
  const ITEM_KO = { color: '색', taste: '맛', direction: '방위', time: '시간', space: '공간', action: '행위' };

  // ── 오행 대응 (전통 오행 배속 기준) ──────────────────
  const COLOR = {
    wood:  { label: '초록',        examples: ['초록 양말', '풀색 머리끈', '작은 화분'] },
    fire:  { label: '빨강',        examples: ['빨간 립', '붉은 스카프', '빨간 펜'] },
    earth: { label: '노랑·베이지', examples: ['베이지 니트', '노란 우산', '황토색 가방'] },
    metal: { label: '흰색·은색',   examples: ['흰 셔츠', '은반지', '흰 운동화'] },
    water: { label: '검정·남색',   examples: ['남색 재킷', '검은 머그', '검은 볼펜'] },
  };
  const TASTE = {
    wood:  { label: '신맛',   examples: ['레몬에이드', '귤', '요거트'] },
    fire:  { label: '쓴맛',   examples: ['아메리카노', '다크초콜릿', '녹차'] },
    earth: { label: '단맛',   examples: ['군고구마', '단호박죽', '꿀차'] },
    metal: { label: '매운맛', examples: ['떡볶이', '생강차', '마라탕'] },
    water: { label: '짠맛',   examples: ['미역국', '김밥', '검은콩 두유'] },
  };
  const DIRECTION = {
    wood:  { label: '동쪽', text: '동쪽으로' },
    fire:  { label: '남쪽', text: '남쪽으로' },
    earth: { label: '중앙', text: '멀리 가지 말고 지금 동네 안에서' },
    metal: { label: '서쪽', text: '서쪽으로' },
    water: { label: '북쪽', text: '북쪽으로' },
  };
  const TIME = {
    wood:  { label: '아침', range: '5–9시',   text: '아침에' },
    fire:  { label: '한낮', range: '11–15시', text: '한낮에' },
    earth: { label: '오후', range: '15–17시', text: '오후에' },
    metal: { label: '저녁', range: '17–21시', text: '저녁에' },
    water: { label: '밤',   range: '21시 이후', text: '밤에' },
  };
  // 실제 장소 (steer-spaces.js) — 없으면 아래 유형으로 대체
  const REAL = (typeof window !== 'undefined' && window.STEER_SPACES) || (typeof STEER_SPACES !== 'undefined' ? STEER_SPACES : null);
  // 방위와 공간은 둘 중 하나만
  const EXCLUSIVE = [['direction', 'space']];
  const partnerOf = item => { const pair = EXCLUSIVE.find(p => p.includes(item)); return pair ? pair.find(i => i !== item) : null; };
  const SPACES = {
    wood:  ['공원 숲길', '독립서점', '식물 가게'],
    fire:  ['영화관', '공연장', '햇빛 잘 드는 카페'],
    earth: ['오래된 밥집', '시장', '도자기 공방'],
    metal: ['갤러리', '오래된 석조 건물', '정돈된 문구점'],
    water: ['하천 산책로', '조용한 도서관', '심야 카페'],
  };

  // ── 행위: 오행 × 십성 ────────────────────────────────
  // 오행 = 행위의 질감, 십성 = 이 사람에게 그 기운이 필요한 이유
  const GROUP_MEANING = {
    비겁: '사람과 함께, 내 힘 키우기',
    식상: '꺼내고 표현하기',
    재성: '정리하고 실행하기',
    관성: '규칙과 루틴 지키기',
    인성: '채우고 배우기',
  };
  const ACTIONS = {
    wood: {
      비겁: ['친구랑 30분 같이 걷기', '같이 화분 하나 고르기'],
      식상: ['걸으면서 떠오른 생각 음성 메모 남기기', '새로 해 보고 싶은 일 하나 적기'],
      재성: ['미뤄 둔 일 하나 지금 시작하기'],
      관성: ['일어나자마자 스트레칭 10분', '정한 시간에 일어나기'],
      인성: ['벤치에 앉아 책 20쪽 읽기', '처음 보는 분야 입문 영상 하나 보기'],
    },
    fire: {
      비겁: ['오랜만인 친구에게 먼저 연락하기', '누군가와 땀 나게 운동하기'],
      식상: ['오늘 찍은 사진 하나 올리기', '소리 내서 노래 한 곡 부르기'],
      재성: ['밝은 자리에서 할 일 목록 정리하기', '사고 싶던 것 하나 정해서 사기'],
      관성: ['약속 장소에 10분 일찍 도착하기', '맡은 일 결과를 먼저 공유하기'],
      인성: ['전시나 공연 하나 보기', '햇볕 아래서 따뜻한 차 마시기'],
    },
    earth: {
      비겁: ['가족이나 친구와 밥 한 끼 먹기', '단골 가게 사장님과 인사 나누기'],
      식상: ['직접 한 끼 차려 먹기', '손으로 뭔가 하나 만들기'],
      재성: ['가방이나 책상 하나 정리하기', '이번 주 쓴 돈 훑어보기'],
      관성: ['세 끼를 비슷한 시간에 먹기', '오늘 한 약속 하나 꼭 지키기'],
      인성: ['어른께 안부 전화 드리기', '익숙한 동네 길 천천히 걷기'],
    },
    metal: {
      비겁: ['친구와 작은 내기 하나 하기', '같이 운동 기록 재 보기'],
      식상: ['미뤄 둔 말 하나 꺼내기', '오늘 하루를 세 줄로 적기'],
      재성: ['안 쓰는 물건 세 개 비우기', '안 보는 구독 하나 해지하기'],
      관성: ['끝낼 시간을 정해 두고 일하기', '알림 끄고 한 가지만 하기'],
      인성: ['하루 돌아보기 일기 쓰기', '혼자 조용히 생각 정리할 시간 갖기'],
    },
    water: {
      비겁: ['친구랑 물가 따라 걷기', '같은 고민 가진 사람과 이야기하기'],
      식상: ['물가에 앉아 생각 적기', '좋아하는 음악 플레이리스트 만들기'],
      재성: ['밤에 내일 계획 세우기', '흩어진 메모 한곳에 모으기'],
      관성: ['정한 시간에 잠들기', '자기 전 휴대폰 30분 내려놓기'],
      인성: ['조용한 곳에서 책 읽기', '반신욕 하며 쉬기'],
    },
  };

  // ── 일진에 따른 최대 선택 개수 ───────────────────────
  // 날씨 좋은 날은 멀리, 흐린 날은 항구 근처만. 문구는 초안
  const LIMITS = {
    '순항':   { max: 5, copy: '바람이 좋은 날. 5개까지 멀리 나가 봐요' },
    '잔잔':   { max: 4, copy: '잔잔한 날. 4개까지 골라요' },
    '흐린 날': { max: 2, copy: '흐린 날엔 가까운 바다만. 2개면 충분해요' },
  };
  function limit(saju) {
    return { tone: saju.today.tone, ...LIMITS[saju.today.tone] };
  }

  // 하루를 기준으로 고정된 선택 (같은 날 같은 사람 → 같은 예시)
  function pickByDay(list, seed) {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  }

  // ── 항목별 선택지 ────────────────────────────────────
  function optionFor(item, el, group, seed) {
    switch (item) {
      case 'color':     return { label: COLOR[el].label, detail: pickByDay(COLOR[el].examples, seed + item) };
      case 'taste':     return { label: TASTE[el].label, detail: pickByDay(TASTE[el].examples, seed + item) };
      case 'direction': return { label: DIRECTION[el].label, detail: DIRECTION[el].text };
      case 'time':      return { label: TIME[el].label, detail: TIME[el].range };
      case 'space': {
        const list = REAL && REAL.filter(p => p.element === el);
        if (list && list.length) {
          const p = pickByDay(list, seed + item);
          return { label: p.name, detail: `${p.type} · 이대 정문에서 ${(p.distance / 1000).toFixed(1)}km`, why: p.why, place: p };
        }
        return { label: pickByDay(SPACES[el], seed + item), detail: '공간 유형' };
      }
      case 'action':    return { label: pickByDay(ACTIONS[el][group], seed + item), detail: GROUP_MEANING[group] };
    }
  }

  function options(saju) {
    const seed = saju.today.date + saju.pillars.day.hanja;
    const sources = {
      용신: { element: saju.roles.용신.element, ko: saju.roles.용신.ko },
      희신: { element: saju.roles.희신.element, ko: saju.roles.희신.ko },
    };
    const groupOf = el => saju.elements.find(e => e.key === el).group;
    const out = {};
    ITEMS.forEach(item => {
      out[item] = Object.entries(sources).map(([role, s]) => ({
        role, element: s.element, elementKo: s.ko, group: groupOf(s.element),
        ...optionFor(item, s.element, groupOf(s.element), seed),
      }));
    });
    return out;
  }

  // 받침 있으면 '을', 없으면 '를'
  const eulReul = w => { const c = w.charCodeAt(w.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '을' : '를'; };

  // ── 조합 ─────────────────────────────────────────────
  // picks: { color:'용신'|'희신'|null, ... } — null이면 그 항목은 빼고 조합
  function compose(saju, picks) {
    const opts = options(saju);
    const chosen = {};
    ITEMS.forEach(item => {
      const role = picks[item];
      if (role) chosen[item] = opts[item].find(o => o.role === role);
    });

    const c = chosen;
    const head = [c.time && c.time.label, c.direction && c.direction.detail].filter(Boolean).join(', ');
    const parts = [];
    if (c.color) parts.push(`${c.color.detail}${eulReul(c.color.detail)} 지니고`);
    if (c.taste) parts.push(`${c.taste.detail} 맛보기`);
    if (c.space) parts.push(`${c.space.label}에서`);
    if (c.action) parts.push(c.action.label);

    const count = Object.keys(chosen).length;
    const lim = limit(saju);

    return {
      chosen,
      lines: ITEMS.filter(i => chosen[i]).map(i => ({ item: i, itemKo: ITEM_KO[i], ...chosen[i] })),
      summary: [head, parts.join(' · ')].filter(Boolean).join(' — '),
      count,
      max: lim.max,
      full: count >= lim.max,          // 더 못 고름
      over: count > lim.max,           // 규칙 위반 (화면에서 막아야 함)
      tone: lim.tone,
    };
  }

  // 새 항목을 추가해도 되는지 (이미 고른 항목의 용신↔희신 바꾸기는 항상 가능)
  // 방위↔공간은 서로 바꿔 끼우는 건 허용 (개수 그대로)
  function canPick(saju, picks, item) {
    if (picks[item]) return true;
    const partner = partnerOf(item);
    if (partner && picks[partner]) return true;
    return Object.values(picks).filter(Boolean).length < limit(saju).max;
  }
  // picks에 항목을 넣을 때 짝 항목을 비움
  function pick(picks, item, role) {
    const next = { ...picks, [item]: role };
    const partner = partnerOf(item);
    if (role && partner) next[partner] = null;
    return next;
  }

  return { ITEMS, ITEM_KO, LIMITS, EXCLUSIVE, partnerOf, limit, canPick, pick, options, compose, data: { COLOR, TASTE, DIRECTION, TIME, SPACES, ACTIONS, GROUP_MEANING } };
});
