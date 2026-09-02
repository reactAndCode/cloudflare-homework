import { Agent, callable, getCurrentAgent, routeAgentRequest, type Connection, type ConnectionContext, type WSMessage } from 'agents';

export type ChattingRoomState = {
  currentlyOnline: number;
};

export class ChattingRoomAgent extends Agent<Env, ChattingRoomState> {
  initialState = {
    currentlyOnline: 0,
  };

  onStart() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `;
  }

  // onStateChanged(state: ChattingRoomState, source: Connection | 'server'): void {
  // 	console.log('new state', state);
  // 	console.log('who did it', source);
  // }

  // validateStateChange(_nextState: ChattingRoomState, source: Connection | 'server'): void {
  // 	if (source !== 'server') throw new Error('cant do this.');
  // }
  //

  shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const nickname = url.searchParams.get('nickname') ?? 'anon';
    return nickname.includes('read');
  }

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const nickname = url.searchParams.get('nickname') ?? 'anon';

    connection.setState({
      nickname,
    });

    this.setState({
      currentlyOnline: this.state.currentlyOnline + 1,
    });
  }

  onClose() {
    this.setState({
      currentlyOnline: this.state.currentlyOnline - 1,
    });
  }

  onMessage(connection: Connection<{ nickname: string }>, message: WSMessage) {
    const messageObj = {
      nickname: connection.state.nickname,
      message: message.toString(),
      created_at: Date.now(),
    };
    if (message.toString().includes('delete')) {
      this.scheduleEvery(30, 'deleteMessages');
    }
    void this.sql`
      INSERT INTO messages (nickname, message, created_at) VALUES (${messageObj.nickname}, ${messageObj.message}, ${messageObj.created_at})
      `;
    // this.broadcast(JSON.stringify(messageObj), [connection.id]);
    this.broadcast(JSON.stringify(messageObj));
  }
  deleteMessages() {
    void this.sql`DELETE FROM messages`;
  }

  @callable()
  loadHistory() {
    const { connection } = getCurrentAgent<ChattingRoomAgent>();
    // this.setConnectionReadonly(connection, true)
    console.log(connection.state, 'loaded history');
    return this.sql`SELECT * FROM messages ORDER BY created_at ASC LIMIT 100`;
  }
}

export default {
  async fetch(request, env) {
    console.log(request.url);
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;