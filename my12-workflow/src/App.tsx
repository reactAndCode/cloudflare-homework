import { Eater } from "./Eater";
import { Owner } from "./Owner";

export default function App() {
  return location.pathname.startsWith("/owner") ? <Owner /> : <Eater />;
}
