const formatJSON = (obj: any, pretty: boolean) => JSON.stringify(obj, null, pretty ? 2 : 0);

export const generateJSONResponse = (obj: any, pretty: boolean) => {
  return new Response(formatJSON(obj, pretty), {
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "cloudbs.dev"
    }
  });
};



