import { useAgent } from 'agents/react';
import type { ChattingRoomAgent, ChattingRoomState } from '../worker/index';
import { useState } from 'react';

type Message = {
  id: number;
  nickname: string;
  message: string;
  created_at: number;
};

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [nickname, setNickname] = useState('');
  const [ready, setReady] = useState(false);

  const agent = useAgent<ChattingRoomAgent, ChattingRoomState>({
    agent: 'ChattingRoomAgent',
    query: {
      nickname,
    },
    enabled: ready,
    onOpen: async () => {
      setIsConnected(true);
      const history = (await agent.stub.loadHistory()) as Message[];
      setMessages(history);
    },
    onMessage: (event) => setMessages((prev) => [...prev, JSON.parse(event.data)]),
    // onStateUpdate: (state) => setPingPongs(state.pingPongCount),
    onStateUpdateError: () => console.log('cant do that.'),
  });

  const sendMessage = () => {
    agent.send(message);
    setMessage('');
  };

  const onConfirm = () => {
    setReady(true);
  };

  if (!isConnected)
    return (
      <div>
        <h1>who are you?</h1>
        <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Type a nickname" autoFocus />
        <button onClick={onConfirm}>confirm</button>
      </div>
    );

  return (
    <div>
      <h1>Chatting Room Agent</h1>
      <h3>Online ppl: {agent?.state?.currentlyOnline}</h3>

      <hr />
      <ul>
        {messages.map((message) => (
          <li>
            <strong>{message.nickname}</strong>: {message.message}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a message..." autoFocus />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;