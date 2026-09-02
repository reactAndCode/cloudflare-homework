import { Agent, callable, type ConnectionContext, getCurrentAgent } from 'agents';

interface Env {
  VOTE_ROOM: DurableObjectNamespace;
}

interface VoteOption {
  id: string;
  label: string;
  votes: number;
}

interface State {
  question: string;
  options: VoteOption[];
  closed: boolean;
}

export class VoteRoom extends Agent<Env, State> {
  static options = { sendIdentityOnConnect: true };

  initialState: State = {
    question: "가장 좋아하는 프로그래밍 언어는?",
    options: [
      { id: "opt1", label: "TypeScript", votes: 0 },
      { id: "opt2", label: "Python", votes: 0 },
      { id: "opt3", label: "Rust", votes: 0 }
    ],
    closed: false
  };

  private isDbInitialized = false;

  async onConnect(connection: any, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get("token");
    const readonly = url.searchParams.get("readonly") === "true";

    // 9. onConnect에서 인증 구현 (유효한 방 토큰 검증)
    if (!token || token !== "secret-token") {
      connection.close(4000, "Unauthorized: Invalid or missing token");
      return;
    }

    // 10. readonly 관전자 구현. (SDK에서 제공하는 setReadonly 또는 커스텀 속성 사용)
    if (readonly) {
      if (typeof connection.setReadonly === 'function') {
        connection.setReadonly(true);
      } else {
        // Fallback for readonly checking if natively not available in some SDK versions
        (connection as any).isReadonly = true;
      }
    }

    // 7. request.cf에서 도시 추출
    const city = (ctx.request.cf as any)?.city || "Unknown";
    (connection as any).city = city;

    // Initialize DB table on first connection
    if (!this.isDbInitialized) {
      this.sql`
        CREATE TABLE IF NOT EXISTS votes_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          option_id TEXT,
          city TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      this.isDbInitialized = true;
    }
  }

  // 6. UI에서 호출할 @callable() 메서드 vote(optionId)
  @callable()
  async vote(optionId: string, city: string = "Unknown") {
    const { connection } = getCurrentAgent();
    if (connection && (connection as any).isReadonly) {
      throw new Error("관전자 모드에서는 투표할 수 없습니다.");
    }

    if (this.state.closed) {
      throw new Error("투표가 종료되었습니다.");
    }

    // 7. this.sql 테이블에 기록 (클라이언트에서 넘겨준 city를 사용)
    this.sql`INSERT INTO votes_log (option_id, city) VALUES (${optionId}, ${city})`;

    // 5. 실시간 동기화를 위한 setState
    this.setState({
      ...this.state,
      options: this.state.options.map((opt: VoteOption) =>
        opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
      )
    });
  }

  // 6. addOption(label) 구현
  @callable()
  async addOption(label: string) {
    const newOption: VoteOption = {
      id: `opt${Date.now()}`,
      label,
      votes: 0
    };
    this.setState({
      ...this.state,
      options: [...this.state.options, newOption]
    });
  }

  // 신규 투표 생성 메서드
  @callable()
  async setNewPoll(question: string, optionLabels: string[]) {
    const newOptions: VoteOption[] = optionLabels.map((label, index) => ({
      id: `opt_${Date.now()}_${index}`,
      label,
      votes: 0
    }));

    this.setState({
      ...this.state,
      question,
      options: newOptions,
      closed: false
    });
  }

  // 6. reset() 구현
  @callable()
  async reset() {
    this.setState({
      ...this.state,
      options: this.state.options.map((opt: VoteOption) => ({ ...opt, votes: 0 }))
    });
  }

  // 8. closePoll 메서드
  @callable()
  async closePoll() {
    this.setState({ ...this.state, closed: true });
  }

  // 8. 투표방 열 때 스케줄링
  @callable()
  async openPollAndSchedule(durationMs: number) {
    this.setState({ ...this.state, closed: false });
    const closesAt = new Date(Date.now() + durationMs);
    // schedule(closesAt, "closePoll")
    if (typeof (this as any).schedule === 'function') {
      (this as any).schedule(closesAt, "closePoll");
    }
  }

  // 관리자용 SQLite 로그 조회 메서드
  @callable()
  async getLogs() {
    // 최신 투표 기록 100개를 가져옵니다.
    const results = [...this.sql`SELECT * FROM votes_log ORDER BY created_at DESC LIMIT 100`];
    return results;
  }
}

function renderTestPage(roomId: string, nickname: string, readonly: boolean = false) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>VoteRoom: ${roomId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jua&display=swap');
    body {
      margin: 0; padding: 0;
      background: linear-gradient(135deg, #ffd1ff 0%, #fae1ff 100%);
      font-family: 'Jua', sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
    }
    .container {
      background: #ffffff;
      border-radius: 24px;
      box-shadow: 0 10px 20px rgba(255, 182, 193, 0.4);
      padding: 30px; width: 450px; text-align: center;
    }
    h2 { color: #ff8b94; margin-top: 0; font-size: 32px; }
    .badge {
      display: inline-block; background: #fff0f5; color: #ff8b94;
      padding: 6px 16px; border-radius: 20px; font-size: 15px; margin-bottom: 25px;
      border: 1px dashed #ffb6c1;
    }
    .vote-panel {
      background: #fffafa; border: 2px solid #ffe4e1; border-radius: 16px;
      padding: 20px; text-align: left; margin-bottom: 20px;
    }
    .vote-question {
      font-size: 22px; color: #ff8b94; margin-top: 0; margin-bottom: 15px;
      text-align: center;
    }
    .option-label {
      display: block; background: #fff; border: 2px solid #ffe4e1;
      padding: 12px 15px; border-radius: 12px; margin-bottom: 10px;
      cursor: pointer; transition: all 0.2s; font-size: 18px; color: #555;
    }
    .option-label:hover { border-color: #ffb6c1; background: #fff0f5; }
    .option-label input { transform: scale(1.3); margin-right: 10px; accent-color: #ff8b94; }
    .vote-count { float: right; color: #ff8b94; font-weight: bold; }
    
    button {
      background: #ffb6c1; color: white; border: none; width: 100%;
      padding: 15px 20px; border-radius: 12px; font-size: 20px; cursor: pointer;
      font-family: 'Jua', sans-serif; transition: transform 0.1s, background 0.3s;
    }
    button:hover { background: #ff9eaa; transform: scale(1.02); }
    button:active { transform: scale(0.98); }
    button:disabled { background: #ccc; cursor: not-allowed; transform: none; }
    
    #status {
      margin-top: 15px; font-size: 16px; color: #ff8b94;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>🎀 라이언의 AI 공부 투표방 🎀</h2>
    <div class="badge">방 이름: ${roomId} | 닉네임: ${nickname}${readonly ? ' | 👁️ 관전자 모드' : ''}</div>
    
    <div class="vote-panel" id="vote-panel">
      <h3 class="vote-question">⏳ 투표 정보를 불러오는 중...</h3>
    </div>
    
    <button id="vote-btn" onclick="sendVote()" disabled>투표하기 🚀</button>
    <div id="status">🌸 서버와 찌릿찌릿 연결 중...</div>
  </div>
  <script>
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const readonlyParam = ${readonly ? "'&readonly=true'" : "''"};
    const ws = new WebSocket(\`\${wsProtocol}//\${location.host}/ws?roomId=${roomId}&nickname=${nickname}&token=secret-token\${readonlyParam}\`);
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('vote-btn');
    
    let currentState = null;
    let callId = 1;
    
    ws.onopen = () => { statusEl.textContent = '🌸 서버와 연결되었어요!'; btn.disabled = false; };
    ws.onclose = () => { statusEl.textContent = '🍂 연결이 끊어졌어요...'; btn.disabled = true; };
    ws.onerror = () => { statusEl.textContent = '💦 앗! 통신 에러가 발생했어요!'; };
    
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        // 에러가 발생한 경우 알럿 창 띄우기
        if (data && data.error) {
          alert('앗! 에러가 발생했어요: ' + data.error);
          statusEl.textContent = '🌸 서버와 연결되었어요!';
          return;
        }

        // 서버에서 오는 상태(State) 페이로드를 파싱하여 화면 갱신
        if (data && data.state) {
          currentState = data.state;
          renderState();
        } else if (Array.isArray(data) && data[0] && data[0].state) {
          currentState = data[0].state;
          renderState();
        }
      } catch (err) {
        // 사용자가 볼 필요 없는 내부 통신 메시지는 무시합니다.
      }
    };
    
    function renderState() {
      if (!currentState) return;
      
      const panel = document.getElementById('vote-panel');
      let html = \`<h3 class="vote-question">\${currentState.question}</h3>\`;
      html += \`<div id="options-container">\`;
      
      currentState.options.forEach(opt => {
        html += \`
          <label class="option-label">
            <input type="radio" name="voteOption" value="\${opt.id}">
            \${opt.label}
            <span class="vote-count">\${opt.votes}표</span>
          </label>
        \`;
      });
      html += \`</div>\`;
      
      if (currentState.closed) {
        html += \`<p style="color:red; text-align:center; margin-top:15px;">투표가 마감되었습니다!</p>\`;
        btn.disabled = true;
      }
      
      panel.innerHTML = html;
    }

    function sendVote() {
      const selected = document.querySelector('input[name="voteOption"]:checked');
      if (!selected) {
        alert('투표할 항목을 먼저 선택해주세요! 🐰');
        return;
      }
      
      // JSON-RPC 페이로드 (Agents SDK 호출 규격)
      const payload = {
        type: "rpc",
        method: "vote",
        args: [selected.value, "Amsterdam"],
        id: "vote_req_" + callId++
      };
      
      ws.send(JSON.stringify(payload));
      statusEl.textContent = '💌 투표 용지를 날려보냈어요!';
      
      setTimeout(() => {
         statusEl.textContent = '🌸 서버와 연결되었어요!';
      }, 2000);
    }
  </script>
</body>
</html>`;
}

function renderAdminPage(roomId: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>VoteRoom Admin: ${roomId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jua&display=swap');
    body {
      margin: 0; padding: 20px;
      background: #f4f7f6;
      font-family: 'Jua', sans-serif;
    }
    .container {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      padding: 30px; max-width: 800px; margin: 0 auto;
    }
    h2 { color: #333; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: center; }
    th { background-color: #ffb6c1; color: white; }
    button {
      background: #ffb6c1; color: white; border: none;
      padding: 10px 15px; border-radius: 8px; cursor: pointer;
      font-family: 'Jua', sans-serif; font-size: 16px;
    }
    button:hover { background: #ff9eaa; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🛠️ 투표방 관리자 페이지 (${roomId})</h2>
    <p>서버에 저장된 SQLite 투표 상세 기록을 실시간으로 확인합니다.</p>
    <button onclick="fetchLogs()">기록 새로고침 🔄</button>
    <button onclick="resetVotes()">투표 초기화 🗑️</button>
    <button onclick="scheduleClose(60000)">1분 뒤 마감하기 ⏳</button>
    <button onclick="closePoll()">즉시 마감하기 🛑</button>
    
    <div style="background: #fff0f5; padding: 20px; border-radius: 12px; margin-top: 20px; text-align: left;">
      <h3 style="margin-top: 0; color: #ff8b94;">✨ 신규 투표 생성</h3>
      <input type="text" id="new-question" placeholder="투표 주제 (예: 점심 메뉴?)" style="box-sizing: border-box; width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ffb6c1; border-radius: 8px; font-family: 'Jua', sans-serif; font-size: 16px;">
      <input type="text" id="new-opt1" placeholder="보기 1 (예: 짜장면)" style="box-sizing: border-box; width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ffb6c1; border-radius: 8px; font-family: 'Jua', sans-serif; font-size: 16px;">
      <input type="text" id="new-opt2" placeholder="보기 2 (예: 짬뽕)" style="box-sizing: border-box; width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ffb6c1; border-radius: 8px; font-family: 'Jua', sans-serif; font-size: 16px;">
      <input type="text" id="new-opt3" placeholder="보기 3 (예: 볶음밥)" style="box-sizing: border-box; width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ffb6c1; border-radius: 8px; font-family: 'Jua', sans-serif; font-size: 16px;">
      <button onclick="createNewPoll()" style="width: 100%;">새 투표 시작하기 🚀</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>투표 항목 (Option)</th>
          <th>투표자 도시 (City)</th>
          <th>투표 시각 (UTC)</th>
        </tr>
      </thead>
      <tbody id="logs-body">
        <tr><td colspan="4">데이터를 불러오는 중...</td></tr>
      </tbody>
    </table>
  </div>
  
  <script>
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(\`\${wsProtocol}//\${location.host}/ws?roomId=${roomId}&nickname=admin&token=secret-token\`);
    let callId = 1;
    let currentOptions = [];
    let lastLogs = [];
    
    ws.onopen = () => fetchLogs();
    
    ws.onmessage = (e) => {
      try {
        let msg = JSON.parse(e.data);
        if (Array.isArray(msg)) msg = msg[0];
        
        // Agent 상태 업데이트 수신 (옵션 이름 매핑용)
        if (msg.type === "cf_agent_state" && msg.state && msg.state.options) {
          currentOptions = msg.state.options;
          if (lastLogs.length > 0) renderLogs(lastLogs);
        }

        if (msg && msg.error) {
          console.error("RPC 에러:", msg.error);
          document.getElementById('logs-body').innerHTML = '<tr><td colspan="4" style="color:red;">오류 발생: ' + msg.error + '</td></tr>';
          return;
        }

        // JSON-RPC 응답 처리
        if (msg && msg.id && typeof msg.id === 'string' && msg.id.startsWith('logs_req')) {
          lastLogs = msg.result || [];
          renderLogs(lastLogs);
        } else if (msg && msg.id && typeof msg.id === 'string' && msg.id.startsWith('reset_req')) {
          alert('투표가 초기화 되었습니다!');
          fetchLogs();
        } else if (msg && msg.id && typeof msg.id === 'string' && msg.id.startsWith('schedule_req')) {
          alert('1분 뒤 마감되도록 타이머가 설정되었습니다!');
        } else if (msg && msg.id && typeof msg.id === 'string' && msg.id.startsWith('close_req')) {
          alert('투표가 즉시 마감되었습니다!');
        } else if (msg && msg.id && typeof msg.id === 'string' && msg.id.startsWith('newpoll_req')) {
          alert('새로운 투표가 시작되었습니다!');
          document.getElementById('new-question').value = '';
          document.getElementById('new-opt1').value = '';
          document.getElementById('new-opt2').value = '';
          document.getElementById('new-opt3').value = '';
        }
      } catch (err) {
        console.error("데이터 파싱 에러:", err);
      }
    };
    
    function fetchLogs() {
      ws.send(JSON.stringify({ type: "rpc", method: "getLogs", args: [], id: "logs_req_" + callId++ }));
    }
    
    function resetVotes() {
      if(confirm('정말 투표 결과를 초기화하시겠습니까? (SQLite 기록은 유지됩니다)')) {
        ws.send(JSON.stringify({ type: "rpc", method: "reset", args: [], id: "reset_req_" + callId++ }));
      }
    }

    function scheduleClose(durationMs) {
      if(confirm('1분 뒤에 투표를 자동 마감할까요?')) {
        ws.send(JSON.stringify({ type: "rpc", method: "openPollAndSchedule", args: [durationMs], id: "schedule_req_" + callId++ }));
      }
    }

    function closePoll() {
      if(confirm('투표를 즉시 마감하시겠습니까?')) {
        ws.send(JSON.stringify({ type: "rpc", method: "closePoll", args: [], id: "close_req_" + callId++ }));
      }
    }

    function createNewPoll() {
      const q = document.getElementById('new-question').value.trim();
      const o1 = document.getElementById('new-opt1').value.trim();
      const o2 = document.getElementById('new-opt2').value.trim();
      const o3 = document.getElementById('new-opt3').value.trim();
      
      if (!q || !o1 || !o2 || !o3) {
        alert('주제와 보기 3개를 모두 입력해주세요!');
        return;
      }
      
      if(confirm('새로운 투표를 시작하시겠습니까?\\n(참고: 기존 실시간 투표 수는 0표로 초기화됩니다)')) {
        ws.send(JSON.stringify({ 
          type: "rpc", 
          method: "setNewPoll", 
          args: [q, [o1, o2, o3]], 
          id: "newpoll_req_" + callId++ 
        }));
      }
    }
    
    function renderLogs(logs) {
      const tbody = document.getElementById('logs-body');
      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">아직 투표 기록이 없습니다.</td></tr>';
        return;
      }
      
      tbody.innerHTML = logs.map(log => {
        const opt = currentOptions.find(o => o.id === log.option_id);
        const label = opt ? opt.label : log.option_id;
        const timeStr = new Date(log.created_at + 'Z').toLocaleString('ko-KR');
        
        return \`
        <tr>
          <td>\${log.id}</td>
          <td>\${label} <small style="color:#888;">(\${log.option_id})</small></td>
          <td>\${log.city}</td>
          <td>\${timeStr}</td>
        </tr>
        \`;
      }).join('');
    }
  </script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 루트 경로(/) 접속 시 HTML 테스트 페이지 렌더링
    if (url.pathname === "/") {
      const roomId = url.searchParams.get("roomId") || "testroom";
      const nickname = url.searchParams.get("nickname") || "tester";
      const readonly = url.searchParams.get("readonly") === "true";
      return new Response(renderTestPage(roomId, nickname, readonly), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // 관리자 페이지(/admin) 라우팅
    if (url.pathname === "/admin") {
      const roomId = url.searchParams.get("roomId") || "testroom";
      return new Response(renderAdminPage(roomId), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Connect to the specific VoteRoom Agent
    // HTML에서 사용하는 /ws 경로는 쿼리의 roomId를 사용하고, 그 외에는 URL 경로 사용
    const roomName = url.pathname === "/ws"
      ? (url.searchParams.get("roomId") || "default-room")
      : (url.pathname.split("/")[2] || "default-room");

    const id = env.VOTE_ROOM.idFromName(roomName);
    const agent = env.VOTE_ROOM.get(id);
    return agent.fetch(request);
  },
} satisfies ExportedHandler<Env>;
