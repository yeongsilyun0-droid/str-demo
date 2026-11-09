/*
 * Steer 사주 계산 엔진 v0.2
 * 생년월일시 → 팔자 · 지장간 · 십성 분포 · 신강/신약 · 용신(억부+조후+종격) · 희신/기신 · 오늘 일진
 *
 * 의존: lunar-javascript (같은 폴더의 lunar.js를 먼저 <script>로 불러오기)
 * 사용: const r = SteerSaju.compute({ year:1990, month:5, day:15, hour:14, minute:30 });
 *
 * 용신 판정 순서 (명리에서 가장 일반적인 방식)
 *   1) 세력 점수: 천간 + 지장간(월률분야 비율), 자리별 가중치(월지 최대, 일지 다음), 삼합·방합 보너스
 *   2) 신강 / 중화 / 신약 판정 + 득령·득지·득세
 *   3) 종격(극신강·극신약) 예외 확인
 *   4) 억부용신: 무엇 때문에 강한지/약한지에 따라 고름
 *   5) 조후용신: 한여름·한겨울생이고 원국에 물·불이 거의 없으면 조후를 우선
 *   6) 희신(용신을 생함) · 기신(용신을 극함) · 구신(기신을 생함) · 한신(나머지)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('lunar-javascript'));
  } else {
    root.SteerSaju = factory({ Solar: root.Solar, Lunar: root.Lunar });
  }
})(this, function (L) {
  const { Solar, Lunar } = L;

  // ── 기본 표 ──────────────────────────────────────────
  const GAN_KO = { 甲:'갑', 乙:'을', 丙:'병', 丁:'정', 戊:'무', 己:'기', 庚:'경', 辛:'신', 壬:'임', 癸:'계' };
  const ZHI_KO = { 子:'자', 丑:'축', 寅:'인', 卯:'묘', 辰:'진', 巳:'사', 午:'오', 未:'미', 申:'신', 酉:'유', 戌:'술', 亥:'해' };
  const GAN_EL = { 甲:'wood', 乙:'wood', 丙:'fire', 丁:'fire', 戊:'earth', 己:'earth', 庚:'metal', 辛:'metal', 壬:'water', 癸:'water' };
  const ZHI_EL = { 子:'water', 丑:'earth', 寅:'wood', 卯:'wood', 辰:'earth', 巳:'fire', 午:'fire', 未:'earth', 申:'metal', 酉:'metal', 戌:'earth', 亥:'water' };
  const EL_KO  = { wood:'목', fire:'화', earth:'토', metal:'금', water:'수' };
  const EL_HANJA = { wood:'木', fire:'火', earth:'土', metal:'金', water:'水' };
  const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'];
  const YANG = new Set(['甲', '丙', '戊', '庚', '壬']);

  // 지장간 (월률분야, 30일 기준 일수 → 비율). 마지막이 본기
  const HIDDEN = {
    子: [['壬', 10], ['癸', 20]],
    丑: [['癸', 9],  ['辛', 3],  ['己', 18]],
    寅: [['戊', 7],  ['丙', 7],  ['甲', 16]],
    卯: [['甲', 10], ['乙', 20]],
    辰: [['乙', 9],  ['癸', 3],  ['戊', 18]],
    巳: [['戊', 7],  ['庚', 7],  ['丙', 16]],
    午: [['丙', 10], ['己', 9],  ['丁', 11]],
    未: [['丁', 9],  ['乙', 3],  ['己', 18]],
    申: [['戊', 7],  ['壬', 7],  ['庚', 16]],
    酉: [['庚', 10], ['辛', 20]],
    戌: [['辛', 9],  ['丁', 3],  ['戊', 18]],
    亥: [['戊', 7],  ['甲', 7],  ['壬', 16]],
  };
  const mainStem = zhi => HIDDEN[zhi][HIDDEN[zhi].length - 1][0];

  // 자리별 가중치 (일간 제외 합 9.5 → 월지 약 32%, 일지 약 16%)
  const POS_WEIGHT = {
    year:  { gan: 1, zhi: 1 },
    month: { gan: 1, zhi: 3 },
    day:   { gan: 0, zhi: 1.5 },
    hour:  { gan: 1, zhi: 1 },
  };

  // 삼합 · 방합 (지지 세 글자가 모두 있으면 해당 오행에 보너스)
  const COMBOS = [
    { set: ['申', '子', '辰'], el: 'water', name: '신자진 수국(삼합)' },
    { set: ['亥', '卯', '未'], el: 'wood',  name: '해묘미 목국(삼합)' },
    { set: ['寅', '午', '戌'], el: 'fire',  name: '인오술 화국(삼합)' },
    { set: ['巳', '酉', '丑'], el: 'metal', name: '사유축 금국(삼합)' },
    { set: ['寅', '卯', '辰'], el: 'wood',  name: '인묘진 목방(방합)' },
    { set: ['巳', '午', '未'], el: 'fire',  name: '사오미 화방(방합)' },
    { set: ['申', '酉', '戌'], el: 'metal', name: '신유술 금방(방합)' },
    { set: ['亥', '子', '丑'], el: 'water', name: '해자축 수방(방합)' },
  ];
  const COMBO_BONUS = 1.5;

  // 오행 상생·상극
  const GENERATES = { wood:'fire', fire:'earth', earth:'metal', metal:'water', water:'wood' };
  const CONTROLS  = { wood:'earth', earth:'water', water:'fire', fire:'metal', metal:'wood' };
  const generatedBy  = el => ELEMENTS.find(e => GENERATES[e] === el);
  const controlledBy = el => ELEMENTS.find(e => CONTROLS[e] === el);

  // 일간 기준 오행 → 십성 그룹, 그룹 → 오행
  function groupOf(dayEl, el) {
    if (el === dayEl) return '비겁';
    if (el === generatedBy(dayEl)) return '인성';
    if (el === GENERATES[dayEl]) return '식상';
    if (el === CONTROLS[dayEl]) return '재성';
    if (el === controlledBy(dayEl)) return '관성';
  }
  function elementOfGroup(dayEl, g) {
    return { 비겁: dayEl, 인성: generatedBy(dayEl), 식상: GENERATES[dayEl], 재성: CONTROLS[dayEl], 관성: controlledBy(dayEl) }[g];
  }
  const GROUPS = ['비겁', '식상', '재성', '관성', '인성'];
  const SHISHEN_BY_GROUP = { 비겁:['비견','겁재'], 식상:['식신','상관'], 재성:['편재','정재'], 관성:['편관','정관'], 인성:['편인','정인'] };
  const SHISHEN_ALL = ['비견','겁재','식신','상관','편재','정재','편관','정관','편인','정인'];
  function shishenOf(dayGan, stem) {
    const g = groupOf(GAN_EL[dayGan], GAN_EL[stem]);
    return SHISHEN_BY_GROUP[g][YANG.has(dayGan) === YANG.has(stem) ? 0 : 1];
  }

  // ── 한국 서머타임 (1987·1988) ─────────────────────────
  const KOREA_DST = [
    [new Date(1987, 4, 10, 2), new Date(1987, 9, 11, 3)],
    [new Date(1988, 4, 8, 2),  new Date(1988, 9, 9, 3)],
  ];

  // ── 입력 정리 ────────────────────────────────────────
  // input: { year, month, day, hour?, minute?, calendar?: 'solar'|'lunar', leapMonth?: bool,
  //          timeUnknown?: bool, longitudeCorrection?: bool }
  function toSolarDate(input) {
    const timeUnknown = input.timeUnknown || input.hour == null;
    const h = timeUnknown ? 12 : input.hour;
    const mi = timeUnknown ? 0 : (input.minute || 0);

    let solar;
    if (input.calendar === 'lunar') {
      const m = input.leapMonth ? -input.month : input.month;
      solar = Lunar.fromYmdHms(input.year, m, input.day, h, mi, 0).getSolar();
    } else {
      solar = Solar.fromYmdHms(input.year, input.month, input.day, h, mi, 0);
    }

    const MIN = 60 * 1000;
    let base = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute());
    const notes = [];

    if (!timeUnknown && KOREA_DST.some(([s, e]) => base >= s && base < e)) {
      base = new Date(base.getTime() - 60 * MIN);
      notes.push('서머타임 기간 출생이라 1시간 보정');
    }
    // 절기(년·월주 경계)는 라이브러리가 중국 표준시(UTC+8) 기준 → 한국시간에서 1시간 빼서 비교
    const jieqiDate = new Date(base.getTime() - 60 * MIN);
    // 일·시주는 출생지 시각 기준. 한국 표준시(동경 135°)와 서울(약 127°) 차이 약 30분 보정
    let date = base;
    if (!timeUnknown && input.longitudeCorrection !== false) {
      date = new Date(base.getTime() - 30 * MIN);
      notes.push('경도 보정 -30분');
    }
    if (timeUnknown) notes.push('시간 모름 — 시주 제외하고 계산');
    return { date, jieqiDate, timeUnknown, notes };
  }

  function pillar(gan, zhi) {
    return { hanja: gan + zhi, ko: GAN_KO[gan] + ZHI_KO[zhi], gan, zhi, ganElement: GAN_EL[gan], zhiElement: ZHI_EL[zhi] };
  }

  const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
  const zeros = keys => Object.fromEntries(keys.map(k => [k, 0]));

  // ── 메인 계산 ────────────────────────────────────────
  function compute(input, opts = {}) {
    const { date, jieqiDate, timeUnknown, notes } = toSolarDate(input);
    const toEc = d => Solar.fromYmdHms(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), 0).getLunar().getEightChar();
    const ecJ = toEc(jieqiDate); // 년·월주용
    const ec = toEc(date);       // 일·시주용
    ec.setSect(1);               // 23시(자시)부터 다음 날 일주 — 국내 만세력 다수 방식

    const pillars = {
      year:  pillar(ecJ.getYearGan(),  ecJ.getYearZhi()),
      month: pillar(ecJ.getMonthGan(), ecJ.getMonthZhi()),
      day:   pillar(ec.getDayGan(),    ec.getDayZhi()),
      hour:  timeUnknown ? null : pillar(ec.getTimeGan(), ec.getTimeZhi()),
    };
    const POS = ['year', 'month', 'day', 'hour'].filter(k => pillars[k]);

    const dayGan = pillars.day.gan;
    const dayEl = GAN_EL[dayGan];

    // 십성 (글자별) + 지장간
    const shishen = {};
    POS.forEach(k => {
      const p = pillars[k];
      shishen[k] = {
        gan: k === 'day' ? '일간' : shishenOf(dayGan, p.gan),
        zhi: shishenOf(dayGan, mainStem(p.zhi)),
        hidden: HIDDEN[p.zhi].map(([s, d]) => ({ stem: s, ko: GAN_KO[s], ratio: round(d / 30), shishen: shishenOf(dayGan, s) })),
      };
    });

    // ── 1) 세력 점수 ──
    const elScore = zeros(ELEMENTS);
    const ssScore = zeros(SHISHEN_ALL);
    POS.forEach(k => {
      const p = pillars[k], w = POS_WEIGHT[k];
      if (w.gan) { elScore[GAN_EL[p.gan]] += w.gan; ssScore[shishenOf(dayGan, p.gan)] += w.gan; }
      HIDDEN[p.zhi].forEach(([s, d]) => {
        const v = w.zhi * d / 30;
        elScore[GAN_EL[s]] += v;
        ssScore[shishenOf(dayGan, s)] += v;
      });
    });

    const branches = POS.map(k => pillars[k].zhi);
    const combos = COMBOS.filter(c => c.set.every(z => branches.includes(z)));
    combos.forEach(c => { elScore[c.el] += COMBO_BONUS; });

    const groupScore = Object.fromEntries(GROUPS.map(g => [g, elScore[elementOfGroup(dayEl, g)]]));
    const total = Object.values(elScore).reduce((a, b) => a + b, 0);
    // 신강약 비율: 일간 자신(가중치 1)도 내 편으로 포함 — '8글자 중 내 편이 몇 개인가'와 같은 방식
    const DAY_SELF = 1;
    const helper = groupScore['비겁'] + groupScore['인성'] + DAY_SELF;
    const ratio = helper / (total + DAY_SELF);

    // ── 2) 신강/신약 + 득령·득지·득세 ──
    const helps = el => el === dayEl || el === generatedBy(dayEl);
    const deukryeong = helps(GAN_EL[mainStem(pillars.month.zhi)]);
    const deukji = helps(GAN_EL[mainStem(pillars.day.zhi)]);
    const deukse = POS.filter(k => k !== 'day').filter(k => helps(pillars[k].ganElement)).length >= 2;
    // 뿌리(통근): 지장간 어디에든 일간과 같은 오행이 있는가
    const rooted = branches.some(z => HIDDEN[z].some(([s]) => GAN_EL[s] === dayEl));

    let strength;
    if (ratio >= 0.8 && groupScore['관성'] < 0.5) strength = '극신강';
    else if (ratio <= 0.2 && !rooted) strength = '극신약';
    else if (ratio >= 0.55) strength = '신강';
    else if (ratio <= 0.45) strength = '신약';
    else strength = '중화';

    const reasons = [];
    reasons.push(`일간 ${dayGan}(${GAN_KO[dayGan]}${EL_KO[dayEl]})을 돕는 기운이 ${Math.round(ratio * 100)}% → ${strength}`);
    reasons.push(`득령 ${deukryeong ? 'O' : 'X'} · 득지 ${deukji ? 'O' : 'X'} · 득세 ${deukse ? 'O' : 'X'}`);
    combos.forEach(c => reasons.push(`${c.name} 성립 → ${EL_KO[c.el]} 기운 강화`));

    // 관성이 쓸 만한가: 점수 1 이상이거나, 천간(일간 제외)·지지 본기 중 하나라도 관성이면 '뿌리 있는 관'으로 봄
    const gwanEl = elementOfGroup(dayEl, '관성');
    const gwanRoot = POS.some(k => (k !== 'day' && pillars[k].ganElement === gwanEl) || GAN_EL[mainStem(pillars[k].zhi)] === gwanEl);
    const ctx = { dayEl, elScore, groupScore, strength, ratio, total, monthZhi: pillars.month.zhi, reasons, gwanRoot };
    const yong = (opts.decideYongsin || decideYongsin)(ctx);

    // 희신·기신·구신·한신
    const Y = yong.element;
    const roles = {
      용신: Y,
      희신: generatedBy(Y),
      기신: controlledBy(Y),
      구신: generatedBy(controlledBy(Y)),
    };
    roles.한신 = ELEMENTS.find(e => !Object.values(roles).includes(e));
    const roleOf = el => Object.keys(roles).find(r => roles[r] === el);

    // 십성 분포 요약
    const shishenDist = SHISHEN_ALL.map(s => ({ name: s, score: round(ssScore[s]) }));
    const groupDist = GROUPS.map(g => ({ group: g, element: elementOfGroup(dayEl, g), score: round(groupScore[g]), share: round(groupScore[g] / total) }));
    const sortedGroups = [...groupDist].sort((a, b) => b.score - a.score);

    // 겉글자 오행 개수 (화면 표시용)
    const counts = zeros(ELEMENTS);
    POS.forEach(k => { counts[pillars[k].ganElement]++; counts[pillars[k].zhiElement]++; });

    const today = todayInfo(opts.today || new Date(), dayGan, roleOf);

    return {
      input: { ...input },
      calcDate: date,
      notes,
      pillars,
      shishen,
      dayMaster: { gan: dayGan, ko: GAN_KO[dayGan], element: dayEl, elementKo: EL_KO[dayEl] },
      elements: ELEMENTS.map(e => ({
        key: e, ko: EL_KO[e], hanja: EL_HANJA[e],
        count: counts[e], score: round(elScore[e] + (e === dayEl ? DAY_SELF : 0)), // 화면용: 일간 글자까지 8글자 전체 기준 (용신 판단은 elScore 그대로)
        share: round((elScore[e] + (e === dayEl ? DAY_SELF : 0)) / (total + DAY_SELF)),
        group: groupOf(dayEl, e), role: roleOf(e),
      })),
      shishenDist,
      groupDist,
      dominantGroup: sortedGroups[0].group,
      weakestGroup: sortedGroups[sortedGroups.length - 1].group,
      strength: { label: strength, ratio: round(ratio), deukryeong, deukji, deukse, rooted },
      combos: combos.map(c => c.name),
      yongsin: { element: Y, ko: EL_KO[Y], hanja: EL_HANJA[Y], group: groupOf(dayEl, Y), method: yong.method, eokbu: yong.eokbu, johu: yong.johu },
      roles: Object.fromEntries(Object.entries(roles).map(([r, e]) => [r, { element: e, ko: EL_KO[e], hanja: EL_HANJA[e] }])),
      reasons,
      today,
    };
  }

  // ── 용신 판정 ────────────────────────────────────────
  function decideYongsin({ dayEl, elScore, groupScore: G, strength, total, monthZhi, reasons, gwanRoot }) {
    const gwanOk = G['관성'] >= 1 || !!gwanRoot;
    const el = g => elementOfGroup(dayEl, g);
    const say = (g, why) => { reasons.push(why); return el(g); };

    // 3) 종격
    if (strength === '극신강') {
      const g = G['비겁'] >= G['인성'] ? '비겁' : '인성';
      reasons.push(`거의 한 기운으로 몰려 있어 종왕격으로 보고 그 흐름(${g})을 따름`);
      return { element: el(g), method: '종격(종왕)', eokbu: el(g), johu: null };
    }
    if (strength === '극신약') {
      const g = ['식상', '재성', '관성'].reduce((a, b) => (G[b] > G[a] ? b : a));
      reasons.push(`일간이 뿌리 없이 매우 약해 종격으로 보고 가장 강한 기운(${g})을 따름`);
      return { element: el(g), method: '종격(종' + { 식상: '아', 재성: '재', 관성: '살' }[g] + ')', eokbu: el(g), johu: null };
    }

    // 4) 억부 (중화는 병약법: 가장 과한 기운을 '병'으로 보고 그것을 다스리는 기운을 고름)
    let eokbu;
    if (strength === '중화') {
      const sick = GROUPS.reduce((a, b) => (G[b] > G[a] ? b : a));
      const CURE = {
        비겁: gwanOk ? ['관성', '비겁이 가장 많음 → 관성으로 다스림'] : ['식상', '비겁이 가장 많음 → 식상으로 힘을 빼 줌'],
        인성: ['재성', '인성이 가장 많음 → 재성으로 눌러 줌'],
        식상: ['인성', '식상이 가장 많음 → 인성으로 눌러 줌'],
        재성: ['비겁', '재성이 가장 많음 → 비겁으로 나눠 가짐'],
        관성: ['인성', '관성이 가장 많음 → 인성으로 관의 기운을 내 편으로 돌림(살인상생)'],
      };
      reasons.push('강약이 비슷한 중화 사주라 가장 과한 기운을 기준으로 봄');
      eokbu = say(CURE[sick][0], CURE[sick][1]);
    } else if (strength === '신강') {
      if (G['인성'] > G['비겁']) {
        eokbu = say('재성', '인성이 많아 강해진 사주 → 재성으로 인성을 눌러 줌');
      } else if (gwanOk) {
        eokbu = say('관성', '비겁이 많아 강해진 사주 → 관성으로 일간을 다스림');
      } else {
        eokbu = say('식상', '비겁이 많은데 관성이 뿌리 없이 약함 → 식상으로 힘을 빼 줌');
      }
    } else {
      const drain = ['식상', '재성', '관성'].reduce((a, b) => (G[b] > G[a] ? b : a));
      if (drain === '재성') {
        eokbu = say('비겁', '재성이 많아 약해진 사주 → 비겁으로 일간을 도움');
      } else {
        eokbu = say('인성', `${drain}이 많아 약해진 사주 → 인성으로 일간을 도움`);
      }
    }

    // 5) 조후: 한여름(巳午未)·한겨울(亥子丑) 출생에서 물/불이 거의 없을 때
    const SUMMER = ['巳', '午', '未'], WINTER = ['亥', '子', '丑'];
    let johu = null, urgent = false;
    if (SUMMER.includes(monthZhi) && elScore.water < 1) {
      johu = 'water'; urgent = elScore.fire / total >= 0.3;   // 불이 30% 이상이면 조열이 심함
    } else if (WINTER.includes(monthZhi) && elScore.fire < 1) {
      johu = 'fire'; urgent = elScore.water / total >= 0.3;   // 물이 30% 이상이면 한습이 심함
    }

    if (johu && johu !== eokbu) {
      const season = johu === 'water' ? '더운 여름생인데 물이 부족' : '추운 겨울생인데 불이 부족';
      if (urgent || strength === '중화') {
        reasons.push(`${season}해 조후가 급함 → ${EL_KO[johu]}를 용신으로 우선`);
        return { element: johu, method: '조후', eokbu, johu };
      }
      reasons.push(`${season}함 → 조후로는 ${EL_KO[johu]}도 필요 (보조)`);
    }
    return { element: eokbu, method: strength === '중화' ? '억부(중화)' : '억부', eokbu, johu };
  }

  // ── 오늘 일진 ────────────────────────────────────────
  function todayInfo(d, dayGan, roleOf) {
    const ec = Solar.fromYmdHms(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12, 0, 0).getLunar().getEightChar();
    const p = pillar(ec.getDayGan(), ec.getDayZhi());
    const dayEl = GAN_EL[dayGan];
    const ganRole = roleOf(p.ganElement), zhiRole = roleOf(p.zhiElement);
    const good = ['용신', '희신'], bad = ['기신', '구신'];
    const score = [ganRole, zhiRole].reduce((s, r) => s + (good.includes(r) ? 1 : bad.includes(r) ? -1 : 0), 0);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      ...p,
      shishen: { gan: shishenOf(dayGan, p.gan), zhi: shishenOf(dayGan, mainStem(p.zhi)) },
      relation: { gan: groupOf(dayEl, p.ganElement), zhi: groupOf(dayEl, p.zhiElement) },
      roles: { gan: ganRole, zhi: zhiRole },
      hasYongsin: ganRole === '용신' || zhiRole === '용신',
      tone: score > 0 ? '순항' : score < 0 ? '흐린 날' : '잔잔',
    };
  }

  return { compute, decideYongsin, EL_KO, EL_HANJA, ELEMENTS };
});
