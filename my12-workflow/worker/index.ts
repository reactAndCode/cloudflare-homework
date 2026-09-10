import { Agent, callable, routeAgentRequest } from "agents";
import type { Order, State } from "./types";
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep,
} from "agents/workflows";

type Params = {
  agentName: string;
};

type ApprovalMetaData = {
  note: string;
  eta: number;
  approved: boolean;
};

export class PizzaWorkflow extends AgentWorkflow<RestaurantAgent, Params> {
  async run(_event: AgentWorkflowEvent<Params>, step: AgentWorkflowStep) {
    const updateState = async (patch: Partial<Order>) => {
      const orders = await this.agent.getOrders();
      const order = orders[this.workflowId];
      await step.updateAgentState({
        orders: {
          ...orders,
          [this.workflowId]: {
            ...order,
            ...patch,
          },
        },
      });
    };

    await updateState({
      stage: "awaiting-approval",
    });

    // await this.reportProgress({
    //   step: "charging",
    //   percent: 0.6,
    //   message: "lalalal",
    // });
    //

    let attempt = 0;
    try {
      const decision = await this.waitForApproval<ApprovalMetaData>(step, {
        timeout: "30 seconds",
      });

      await updateState({
        etaMinutes: decision.eta,
        note: decision.note,
        stage: "paying",
      });

      await step.do(
        "charge",
        {
          retries: {
            limit: 10,
            delay: "5 seconds",
            backoff: "constant",
          },
        },
        async () => {
          await updateState({
            chargeAttempts: attempt,
          });
          attempt++;
          if (Math.random() < 0.8) throw new Error("Card declined");
          return {
            chargedAt: Date.now(),
          };
        },
      );

      await updateState({
        stage: "preparing",
      });

      await step.sleep("preparing sleep", "10 seconds");

      await updateState({
        stage: "baking",
      });

      await step.sleep("baking sleep", "10 seconds");

      await updateState({
        stage: "delivering",
      });

      await step.sleep("delivering sleep", "10 seconds");

      await updateState({
        stage: "delivered",
      });
    } catch (e) {
      console.log(e);
      await updateState({
        stage: "rejected",
      });
      return;
    }

    step.reportComplete({
      something: "hello",
    });
  }
}

export class RestaurantAgent extends Agent<Env, State> {
  initialState: State = { orders: {} };

  async onWorkflowComplete(
    workflowName: string,
    workflowId: string,
    result?: unknown,
  ) {
    console.log(workflowName, workflowId, "finished with result:", result);
  }

  @callable()
  async placeOrder() {
    // const { id } = await this.env.PIZZA_WORKFLOW.create({
    //   params: {
    //     agentName: this.name,
    //   },
    // });

    const orderId = await this.runWorkflow("PIZZA_WORKFLOW", {});

    this.setState({
      orders: {
        ...this.state.orders,
        [orderId]: { orderId, stage: "pending" },
      },
    });
  }

  getOrders() {
    return this.state.orders;
  }

  // @callable()
  // async updateOrder(orderId: string, patch: Partial<Order>) {
  //   this.setState({
  //     orders: {
  //       ...this.state.orders,
  //       [orderId]: { ...this.state.orders[orderId], ...patch },
  //     },
  //   });
  // }

  @callable()
  async approveOrder(orderId: string, eta: number, note: string) {
    // const instance = await this.env.PIZZA_WORKFLOW.get(orderId);
    // await instance.sendEvent({
    //   type: "potatoproval",
    //   payload: {
    //     eta,
    //     note,
    //     approved: true,
    //   },
    // });
    await this.approveWorkflow(orderId, {
      reason: "Approved by the kitchen",
      metadata: {
        eta,
        note,
      },
    });
  }
  @callable()
  async rejectOrder(orderId: string) {
    await this.rejectWorkflow(orderId);
  }

  // onWorkflowProgress(
  //   workflowName: string,
  //   workflowId: string,
  //   progress: DefaultProgress,
  // ) {}
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
