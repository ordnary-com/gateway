export interface Env {
  DISPATCHER: DispatchNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const name = url.hostname.split(".")[0];

    try {
      const userWorker = env.DISPATCHER.get(name);
      return await userWorker.fetch(request);
    } catch (e: any) {
      if (e.message?.includes("Worker not found")) {
        return new Response(`Service "${name}" bestaat niet onder ordint.dev`, { status: 404 });
      }
      return new Response("Interne fout: " + e.message, { status: 500 });
    }
  },
};