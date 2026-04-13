(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySubtitle = document.getElementById("overlaySubtitle");
  const overlayButton = document.getElementById("overlayButton");
  const hudStructure = document.getElementById("hudStructure");
  const hudStyle = document.getElementById("hudStyle");
  const hudMaterial = document.getElementById("hudMaterial");
  const hudHelp = document.getElementById("hudHelp");

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const roundRectPath = (c, x, y, w, h, r) => {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
  };

  const MATERIALS = {
    stone: { label: "石头", value: 5, color: "#cbd5e1" },
    steel: { label: "钢铁", value: 8, color: "#94a3b8" },
    glass: { label: "玻璃", value: 12, color: "#7dd3fc" },
  };

  const STRUCTURE = {
    tall: "Tall",
    wide: "Wide",
  };

  const STYLE = {
    gothic: "Gothic",
    industrialModern: "Industrial / Modern",
  };

  const ASSETS = {
    redHouse: new Image(),
    westminster: new Image(),
    hoover: new Image(),
    bbc: new Image(),
  };
  ASSETS.redHouse.src = "assets/buildings/red-house.jpg";
  ASSETS.westminster.src = "assets/buildings/westminster-abbey.jpg";
  ASSETS.hoover.src = "assets/buildings/hoover-factory.jpg";
  ASSETS.bbc.src = "assets/buildings/bbc-building.jpg";

  const BUILDINGS = {
    redHouse: { id: "redHouse", name: "Red House", img: ASSETS.redHouse },
    westminster: { id: "westminster", name: "Westminster Abbey", img: ASSETS.westminster },
    hoover: { id: "hoover", name: "Hoover Factory", img: ASSETS.hoover },
    bbc: { id: "bbc", name: "BBC Building", img: ASSETS.bbc },
  };

  const toMaterialTier = (score) => {
    if (score <= 30) return "low";
    if (score <= 70) return "mid";
    return "high";
  };

  const resolveFinalBuilding = ({ structure, style, materialScore }) => {
    const tier = toMaterialTier(materialScore);
    if (structure === STRUCTURE.wide && tier === "low") return BUILDINGS.redHouse;
    if (structure === STRUCTURE.tall && style === STYLE.gothic) return BUILDINGS.westminster;
    if (structure === STRUCTURE.wide && style === STYLE.industrialModern) return BUILDINGS.hoover;
    if (structure === STRUCTURE.tall && tier === "high") return BUILDINGS.bbc;

    const candidates = [
      {
        building: BUILDINGS.redHouse,
        wants: { structure: STRUCTURE.wide, style: null, tier: ["low", "mid"] },
      },
      {
        building: BUILDINGS.westminster,
        wants: { structure: STRUCTURE.tall, style: STYLE.gothic, tier: ["mid", "high"] },
      },
      {
        building: BUILDINGS.hoover,
        wants: { structure: STRUCTURE.wide, style: STYLE.industrialModern, tier: ["mid"] },
      },
      {
        building: BUILDINGS.bbc,
        wants: { structure: STRUCTURE.tall, style: STYLE.industrialModern, tier: ["high"] },
      },
    ];

    const scoreCandidate = (c) => {
      let s = 0;
      if (structure && c.wants.structure === structure) s += 2;
      if (c.wants.style && style && c.wants.style === style) s += 2;
      if (c.wants.tier.includes(tier)) s += 1;
      return s;
    };

    let best = candidates[0];
    let bestScore = scoreCandidate(best);
    for (let i = 1; i < candidates.length; i += 1) {
      const sc = scoreCandidate(candidates[i]);
      if (sc > bestScore) {
        best = candidates[i];
        bestScore = sc;
      }
    }
    return best.building;
  };

  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const fitCanvas = () => {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const createRun = () => {
    const seed = Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    return {
      seed,
      rng,
      state: "intro",
      lastTs: null,
      time: 0,
      progress: 0,
      speed: 1 / 26,
      player: { lane: -1, laneX: -1, laneTarget: -1 },
      structure: null,
      style: null,
      materialScore: 0,
      gates: [
        {
          id: "structure",
          at: 0.16,
          chosen: false,
          left: { label: "高塔 Tall", apply: (r) => (r.structure = STRUCTURE.tall) },
          right: { label: "方楼 Wide", apply: (r) => (r.structure = STRUCTURE.wide) },
        },
        {
          id: "style",
          at: 0.34,
          chosen: false,
          left: { label: "哥特 Gothic", apply: (r) => (r.style = STYLE.gothic) },
          right: { label: "工业/现代", apply: (r) => (r.style = STYLE.industrialModern) },
        },
      ],
      pickups: [],
      spawnCursor: 0.42,
      materialZone: { start: 0.4, end: 0.9 },
      finishAt: 1,
      end: { active: false, t: 0, building: null },
    };
  };

  let run = createRun();

  const showOverlay = ({ title, subtitle, buttonLabel, bottom = false }) => {
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle;
    overlayButton.textContent = buttonLabel;
    if (bottom) {
      overlay.classList.add("overlay--bottom");
    } else {
      overlay.classList.remove("overlay--bottom");
    }
    overlay.hidden = false;
  };

  const hideOverlay = () => {
    overlay.hidden = true;
  };

  const updateHud = () => {
    hudStructure.textContent = `Structure: ${run.structure || "-"}`;
    hudStyle.textContent = `Style: ${run.style || "-"}`;
    hudMaterial.textContent = `Material: ${run.materialScore}`;
    hudHelp.textContent = "←/→ 或滑动：左 / 右";
  };

  const laneToX = (lane, w) => {
    const roadW = Math.min(520, w * 0.66);
    return w / 2 + lane * (roadW / 4);
  };

  const applyChoice = (dir) => {
    if (run.state !== "running") return;
    run.player.laneTarget = dir < 0 ? -1 : 1;
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") applyChoice(-1);
    if (e.key === "ArrowRight") applyChoice(1);
    if (e.key === "Enter" && run.state !== "running") startRun();
  };

  let touchStartX = null;
  const onPointerDown = (e) => {
    touchStartX = e.clientX;
  };
  const onPointerUp = (e) => {
    if (touchStartX == null) return;
    const dx = e.clientX - touchStartX;
    touchStartX = null;
    const threshold = Math.min(60, window.innerWidth * 0.12);
    if (Math.abs(dx) < threshold) return;
    applyChoice(dx < 0 ? -1 : 1);
  };

  window.addEventListener("resize", fitCanvas);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  const tryStartFromOverlay = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (e?.stopPropagation) e.stopPropagation();
    if (run.state === "intro" || run.state === "ended") startRun();
  };

  overlayButton.addEventListener("click", tryStartFromOverlay);
  overlayButton.addEventListener("pointerup", tryStartFromOverlay);
  overlayButton.addEventListener("touchend", tryStartFromOverlay, { passive: false });

  const startIntro = () => {
    run = createRun();
    run.state = "intro";
    updateHud();
    showOverlay({
      title: "筑梦大英",
      subtitle: "左右滑动选择，两次选择 + 收集材料，在 20–30 秒内生成一座真实英国建筑",
      buttonLabel: "开始",
    });
  };

  const startRun = () => {
    run = createRun();
    run.state = "running";
    run.lastTs = null;
    run.time = 0;
    run.progress = 0;
    run.player.lane = -1;
    run.player.laneTarget = -1;
    run.player.laneX = -1;
    run.structure = null;
    run.style = null;
    run.materialScore = 0;
    run.pickups.length = 0;
    run.spawnCursor = run.materialZone.start + 0.02;
    run.end.active = false;
    hideOverlay();
    updateHud();
  };

  const processGates = () => {
    for (const gate of run.gates) {
      if (!gate.chosen && run.progress >= gate.at) {
        const takeLeft = run.player.lane <= 0;
        if (takeLeft) gate.left.apply(run);
        else gate.right.apply(run);
        gate.chosen = true;
        updateHud();
      }
    }
  };

  const spawnPickups = () => {
    if (run.progress < run.materialZone.start) return;
    if (run.spawnCursor > run.materialZone.end) return;
    const ahead = 0.22;
    while (run.spawnCursor < Math.min(run.materialZone.end, run.progress + ahead)) {
      const lane = run.rng() < 0.5 ? -1 : 1;
      const t = run.rng();
      const type = t < 0.44 ? "stone" : t < 0.78 ? "steel" : "glass";
      const gap = lerp(0.02, 0.05, run.rng());
      run.pickups.push({
        id: `${run.seed}-${Math.floor(run.spawnCursor * 10000)}-${lane}`,
        at: run.spawnCursor,
        lane,
        type,
        collected: false,
      });
      run.spawnCursor += gap;
    }
  };

  const collectPickups = () => {
    const hitWindow = 0.018;
    for (const p of run.pickups) {
      if (p.collected) continue;
      if (p.lane !== run.player.lane) continue;
      if (Math.abs(p.at - run.progress) > hitWindow) continue;
      p.collected = true;
      run.materialScore = clamp(run.materialScore + MATERIALS[p.type].value, 0, 100);
      updateHud();
    }
    const keepAfter = run.progress - 0.08;
    run.pickups = run.pickups.filter((p) => !p.collected && p.at >= keepAfter);
  };

  const endRun = () => {
    run.state = "ended";
    run.end.active = true;
    run.end.t = 0;
    run.end.building = resolveFinalBuilding({
      structure: run.structure || STRUCTURE.wide,
      style: run.style || STYLE.industrialModern,
      materialScore: run.materialScore,
    });
    updateHud();
    showOverlay({
      title: `You built: ${run.end.building.name}!`,
      subtitle: "再来一局，试试不同的组合（结构 + 风格 + 材质等级）",
      buttonLabel: "再来一局",
      bottom: true,
    });
  };

  const materialPalette = ({ tier, style }) => {
    if (tier === "high") {
      return {
        base: "#0ea5e9",
        fill: "rgba(125, 211, 252, 0.35)",
        glow: "rgba(56, 189, 248, 0.65)",
        accent: style === STYLE.gothic ? "#fbbf24" : "#a7f3d0",
      };
    }
    if (tier === "mid") {
      return {
        base: "#cbd5e1",
        fill: "rgba(148, 163, 184, 0.32)",
        glow: "rgba(226, 232, 240, 0.25)",
        accent: style === STYLE.gothic ? "#60a5fa" : "#f59e0b",
      };
    }
    return {
      base: "#ef4444",
      fill: "rgba(239, 68, 68, 0.25)",
      glow: "rgba(244, 63, 94, 0.18)",
      accent: "#fca5a5",
    };
  };

  const drawBuilding = ({
    x,
    y,
    w,
    h,
    structure,
    style,
    tier,
    stage,
    focusBuildingId,
    rotation = 0,
  }) => {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rotation);
    ctx.translate(-w / 2, -h / 2);

    const pal = materialPalette({ tier, style });
    const skeleton = stage === "early";
    const complete = stage === "mid" || stage === "late";
    const glow = stage === "late";

    if (focusBuildingId) {
      const b = Object.values(BUILDINGS).find((x) => x.id === focusBuildingId);
      if (b && b.img && b.img.complete) {
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, 0, 0, w, h, 16);
        ctx.clip();
        
        const imgRatio = b.img.width / b.img.height;
        const boxRatio = w / h;
        let dw = w;
        let dh = h;
        if (imgRatio > boxRatio) {
          dw = h * imgRatio;
        } else {
          dh = w / imgRatio;
        }
        ctx.drawImage(b.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        roundRectPath(ctx, 0, 0, w, h, 16);
        ctx.stroke();
        ctx.restore();
        return;
      }
    }

    const stroke = (alpha) => `rgba(226, 232, 240, ${alpha})`;
    const lineW = Math.max(2, Math.round(Math.min(w, h) * 0.015));

    const baseY = h * 0.88;
    const floorH = h * 0.14;
    const foundationW = w * (structure === STRUCTURE.tall ? 0.5 : 0.82);
    const foundationX = (w - foundationW) / 2;

    if (glow) {
      ctx.fillStyle = pal.glow;
      ctx.beginPath();
      roundRectPath(
        ctx,
        foundationX - w * 0.02,
        baseY - floorH - h * 0.02,
        foundationW + w * 0.04,
        floorH + h * 0.04,
        16,
      );
      ctx.fill();
    }

    ctx.lineWidth = lineW;
    ctx.strokeStyle = stroke(0.9);
    ctx.fillStyle = complete ? pal.fill : "rgba(255,255,255,0.05)";
    ctx.beginPath();
    roundRectPath(ctx, foundationX, baseY - floorH, foundationW, floorH, 12);
    if (complete) ctx.fill();
    ctx.stroke();

    const bodyW = w * (structure === STRUCTURE.tall ? 0.38 : 0.76);
    const bodyH = h * (structure === STRUCTURE.tall ? 0.56 : 0.46);
    const bodyX = (w - bodyW) / 2;
    const bodyY = baseY - floorH - bodyH;

    ctx.fillStyle = complete ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
    ctx.strokeStyle = stroke(0.85);
    ctx.beginPath();
    roundRectPath(ctx, bodyX, bodyY, bodyW, bodyH, structure === STRUCTURE.tall ? 10 : 14);
    if (complete) ctx.fill();
    ctx.stroke();

    const isGothic = style === STYLE.gothic;
    const isModern = style === STYLE.industrialModern;
    const tierIsLow = tier === "low";

    if (structure === STRUCTURE.tall) {
      const towerW = w * 0.24;
      const towerH = h * 0.52;
      const towerX = (w - towerW) / 2;
      const towerY = bodyY - towerH + h * 0.08;
      ctx.fillStyle = complete ? pal.fill : "rgba(255,255,255,0.03)";
      ctx.strokeStyle = stroke(0.9);
      ctx.beginPath();
      roundRectPath(ctx, towerX, towerY, towerW, towerH, isModern ? 16 : 8);
      if (complete) ctx.fill();
      ctx.stroke();

      if (isGothic || focusBuildingId === BUILDINGS.westminster.id) {
        ctx.fillStyle = complete ? pal.base : "rgba(255,255,255,0.02)";
        ctx.strokeStyle = stroke(0.85);
        ctx.beginPath();
        ctx.moveTo(w / 2, towerY - h * 0.12);
        ctx.lineTo(towerX, towerY + h * 0.06);
        ctx.lineTo(towerX + towerW, towerY + h * 0.06);
        ctx.closePath();
        if (complete) ctx.fill();
        ctx.stroke();

        if (complete && (tier === "mid" || tier === "high")) {
          const winW = towerW * 0.34;
          const winH = towerH * 0.22;
          ctx.fillStyle = "rgba(96, 165, 250, 0.35)";
          ctx.strokeStyle = "rgba(96, 165, 250, 0.55)";
          ctx.beginPath();
          roundRectPath(ctx, w / 2 - winW / 2, towerY + towerH * 0.35, winW, winH, 10);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = complete ? pal.base : "rgba(255,255,255,0.02)";
        ctx.strokeStyle = stroke(0.8);
        ctx.beginPath();
        roundRectPath(ctx, w / 2 - towerW * 0.55, towerY - h * 0.08, towerW * 1.1, h * 0.1, 18);
        if (complete) ctx.fill();
        ctx.stroke();
      }
    } else {
      if (isModern || focusBuildingId === BUILDINGS.hoover.id) {
        ctx.strokeStyle = `rgba(245, 158, 11, ${complete ? 0.75 : 0.35})`;
        ctx.lineWidth = Math.max(2, Math.round(lineW * 0.9));
        const stripeCount = 4;
        for (let i = 1; i <= stripeCount; i += 1) {
          const sx = bodyX + (bodyW * i) / (stripeCount + 1);
          ctx.beginPath();
          ctx.moveTo(sx, bodyY + bodyH * 0.12);
          ctx.lineTo(sx, bodyY + bodyH * 0.88);
          ctx.stroke();
        }
      }
      if (tierIsLow || focusBuildingId === BUILDINGS.redHouse.id) {
        ctx.strokeStyle = `rgba(239, 68, 68, ${complete ? 0.65 : 0.3})`;
        ctx.lineWidth = Math.max(2, Math.round(lineW * 0.8));
        const brickRows = 6;
        for (let i = 1; i < brickRows; i += 1) {
          const sy = bodyY + (bodyH * i) / brickRows;
          ctx.beginPath();
          ctx.moveTo(bodyX + bodyW * 0.06, sy);
          ctx.lineTo(bodyX + bodyW * 0.94, sy);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = stroke(0.85);
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(bodyX, bodyY);
      ctx.lineTo(w / 2, bodyY - h * 0.12);
      ctx.lineTo(bodyX + bodyW, bodyY);
      ctx.stroke();
    }

    if (complete && isModern && (tier === "high" || focusBuildingId === BUILDINGS.bbc.id)) {
      const glassW = bodyW * 0.86;
      const glassH = bodyH * 0.62;
      ctx.fillStyle = "rgba(125, 211, 252, 0.22)";
      ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
      ctx.beginPath();
      roundRectPath(ctx, (w - glassW) / 2, bodyY + bodyH * 0.18, glassW, glassH, 14);
      ctx.fill();
      ctx.stroke();
    }

    if (skeleton) {
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = "rgba(226, 232, 240, 0.65)";
      ctx.lineWidth = lineW;
      ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  const drawWorld = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const skyTop = "#0b1224";
    const skyBottom = "#070a10";
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const roadW = Math.min(520, w * 0.66);
    const roadX = (w - roadW) / 2;
    const roadY = h * 0.08;
    const roadH = h * 0.86;

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(roadX, roadY, roadW, roadH);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(roadX, roadY, roadW, roadH);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    const lx = roadX + roadW / 2;
    ctx.beginPath();
    ctx.moveTo(lx, roadY);
    ctx.lineTo(lx, roadY + roadH);
    ctx.stroke();
    const playerY = roadY + roadH * 0.78;
    const playerX = laneToX(run.player.laneX, w);

    const drawGate = (gate) => {
      const dy = gate.at - run.progress;
      const y = playerY - dy * roadH * 1.25;
      if (y < roadY - 80 || y > roadY + roadH + 80) return;
      const gateH = 62;
      const gateW = roadW * 0.92;
      const gx = (w - gateW) / 2;
      const gy = y - gateH / 2;

      ctx.fillStyle = gate.chosen ? "rgba(34, 197, 94, 0.18)" : "rgba(59, 130, 246, 0.18)";
      ctx.strokeStyle = gate.chosen ? "rgba(34, 197, 94, 0.55)" : "rgba(59, 130, 246, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      roundRectPath(ctx, gx, gy, gateW, gateH, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
      ctx.font = "600 14px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const leftLabel = gate.left.label;
      const rightLabel = gate.right.label;
      const midY = gy + gateH / 2;
      ctx.fillText(leftLabel, gx + gateW * 0.25, midY);
      ctx.fillText(rightLabel, gx + gateW * 0.75, midY);

      ctx.strokeStyle = "rgba(226, 232, 240, 0.15)";
      ctx.beginPath();
      ctx.moveTo(gx + gateW / 2, gy + 10);
      ctx.lineTo(gx + gateW / 2, gy + gateH - 10);
      ctx.stroke();
    };

    for (const gate of run.gates) drawGate(gate);

    for (const p of run.pickups) {
      const dy = p.at - run.progress;
      const y = playerY - dy * roadH * 1.25;
      if (y < roadY - 60 || y > roadY + roadH + 60) continue;
      const x = laneToX(p.lane, w);
      const mat = MATERIALS[p.type];
      const r = 12;
      ctx.fillStyle = mat.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const finishDy = run.finishAt - run.progress;
    const finishY = playerY - finishDy * roadH * 1.25;
    if (finishY < roadY + roadH + 120 && finishY > roadY - 120) {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(roadX + roadW * 0.06, finishY);
      ctx.lineTo(roadX + roadW * 0.94, finishY);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "700 12px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("FINISH", w / 2, finishY - 6);
    }

    ctx.fillStyle = "rgba(167, 243, 208, 0.95)";
    ctx.strokeStyle = "rgba(167, 243, 208, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRectPath(ctx, playerX - 14, playerY - 18, 28, 36, 10);
    ctx.fill();
    ctx.stroke();

    const tier = toMaterialTier(run.materialScore);
    const stage = run.materialScore <= 30 ? "early" : run.materialScore <= 70 ? "mid" : "late";
    const previewX = w - 168;
    const previewY = 62;
    const previewW = 140;
    const previewH = 160;

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roundRectPath(ctx, previewX, previewY, previewW, previewH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("实时预览", previewX + 10, previewY + 10);

    drawBuilding({
      x: previewX + 12,
      y: previewY + 28,
      w: previewW - 24,
      h: previewH - 40,
      structure: run.structure || STRUCTURE.wide,
      style: run.style || STYLE.industrialModern,
      tier,
      stage,
      focusBuildingId: null,
    });

    if (run.end.active) {
      const t = clamp(run.end.t / 2.2, 0, 1);
      const a = easeInOutCubic(t);
      const bigW = Math.min(520, w * 0.74);
      const bigH = Math.min(520, h * 0.74);
      const bx = (w - bigW) / 2;
      const by = h * 0.14 + (1 - a) * 40;
      const rot = (1 - a) * 0.22;
      const focus = run.end.building?.id || BUILDINGS.westminster.id;
      const forcedStyle =
        focus === BUILDINGS.westminster.id
          ? STYLE.gothic
          : focus === BUILDINGS.redHouse.id
            ? STYLE.industrialModern
            : STYLE.industrialModern;
      const forcedStructure =
        focus === BUILDINGS.westminster.id || focus === BUILDINGS.bbc.id ? STRUCTURE.tall : STRUCTURE.wide;
      const forcedTier = focus === BUILDINGS.bbc.id ? "high" : focus === BUILDINGS.hoover.id ? "mid" : tier;
      const forcedStage = "late";

      ctx.globalAlpha = 0.85 * a;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      drawBuilding({
        x: bx,
        y: by,
        w: bigW,
        h: bigH,
        structure: forcedStructure,
        style: forcedStyle,
        tier: forcedTier,
        stage: forcedStage,
        focusBuildingId: focus,
        rotation: rot,
      });
    }
  };

  const tick = (ts) => {
    if (run.lastTs == null) run.lastTs = ts;
    const dt = Math.min(0.033, (ts - run.lastTs) / 1000);
    run.lastTs = ts;

    if (run.state === "running") {
      run.time += dt;

      run.progress = clamp(run.progress + run.speed * dt, 0, 1.2);
      processGates();

      spawnPickups();
      collectPickups();

      run.player.laneX = lerp(run.player.laneX, run.player.laneTarget, 1 - Math.pow(0.001, dt));
      if (Math.abs(run.player.laneX - run.player.laneTarget) < 0.001) run.player.laneX = run.player.laneTarget;
      run.player.lane = run.player.laneTarget;

      if (run.progress >= run.finishAt) endRun();
    }

    if (run.state === "ended") {
      run.end.t += dt;
    }

    drawWorld();
    requestAnimationFrame(tick);
  };

  fitCanvas();
  startIntro();
  requestAnimationFrame(tick);
})();
