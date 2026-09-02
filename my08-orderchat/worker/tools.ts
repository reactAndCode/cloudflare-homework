import { tool } from "ai";
import z from "zod";

export const getMenu = tool({
    title: "getMenu",
    description: "Get the food menu available for ordering.",
    inputSchema: z.object({}),
    execute: async () => {
        return {
            items: [
                { name: "피자", price: 20000 },
                { name: "라지 페퍼로니", price: 23000 },
                { name: "타코", price: 12000 },
                { name: "비빔밥", price: 10000 },
            ],
        };
    },
});

export const getLocation = tool({
    title: "getLocation",
    description: "Use this to get the user location from the browser. Call this before recommending a branch.",
    inputSchema: z.object({}),
});

export const createTools = (
    cart: { item: string; price: number }[],
    addToCartCallback: (item: { item: string; price: number }) => void,
    clearCartCallback: () => void
) => {
    return {
        getMenu,
        getLocation,
        viewCart: tool({
            title: "viewCart",
            description: "View the items currently in the user's cart and the total price.",
            inputSchema: z.object({}),
            execute: async () => {
                const total = cart.reduce((acc, curr) => acc + curr.price, 0);
                return {
                    items: cart,
                    totalPrice: total,
                };
            },
        }),
        addToCart: tool({
            title: "addToCart",
            description: "Add an item to the user's cart. You must provide the exact name and price of the item from the menu.",
            inputSchema: z.object({
                item: z.string().meta({ description: "The name of the item to add to the cart" }),
                price: z.number().meta({ description: "The price of the item" }),
            }),
            execute: async ({ item, price }) => {
                addToCartCallback({ item, price });
                return { success: true, message: `${item} added to cart.` };
            },
        }),
        placeOrder: tool({
            title: "placeOrder",
            description: "Place the final order for the items in the cart. Requires user approval.",
            inputSchema: z.object({
                totalPrice: z.number().meta({ description: "The total price of the order to confirm" }),
            }),
            execute: async ({ totalPrice }) => {
                clearCartCallback();
                return { success: true, message: `Order confirmed for total: ${totalPrice}원` };
            },
            needsApproval: () => true, // Always require approval for placing an order
        }),
    };
};