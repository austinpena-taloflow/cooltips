import { generateJSONResponse } from "./json-response";

export async function handleRequest(request: Request): Promise<Response> {

  // Get the list of URL's from the Request
  let urlArray = getURLParam(request, "url");
  if (!urlArray) {
    return generateJSONResponse({ "hey": "no-url" }, true);
  }

  // Add the list of requests to KV to an array and add the data if it is found
  // if the data isn't found, the ResponseObject["found"] field will be false
  let requestsToKV = [] as Promise<void>[];
  let pageDetails = [] as ResponseObject[];
  urlArray.map((url) => {
    requestsToKV.push(getUrlFromKV(url, { url: url, found: false }, pageDetails));
  });
  await Promise.all(requestsToKV);

  // Fill in the missing details by requesting the original page
  // As before, the async requests are added to an array and requested
  // in parallel
  let requestsToOriginalPage = [] as Promise<void>[];
  pageDetails.map((detail) => {
    if (!detail.found) {
      requestsToOriginalPage.push(getDescriptionAndImage(detail.url, detail));
    }
  });
  await Promise.all(requestsToOriginalPage);
  return generateJSONResponse(pageDetails, true);
}

const getUrlFromKV = async (key: string, values: ResponseObject, pageDetails: ResponseObject[]): Promise<void> => {
  // @ts-ignore
  let response = await DEVTWO.get(key) as string | null;
  if (response === null) {
    pageDetails.push(values);
    return;
  }
  let parsedResponseObject = await JSON.parse(response) as ResponseObject;
  parsedResponseObject.found = true;
  pageDetails.push(parsedResponseObject);
};

const getURLParam = (request: Request, key: string): string[] | null => {
  let url = new URL(request.url);
  let urlsWithCommas = url.searchParams.get(key);
  if (!urlsWithCommas) {
    return null;
  }
  return urlsWithCommas?.split(",");
};


type ResponseObject = {
  "url": string,
  "found": boolean,
  "custom-description"?: string | null,
  "custom-image"?: string | null,
  "og:image"?: string | null,
  "og:video:url"?: string | null,
  "twitter_player"?: string | null,
  "embedURL"?: string | null,
  "metaDescription"?: string | null,
  "title"?: string | null,
}

const getDescriptionAndImage = async (url: string, responseObject: ResponseObject) => {
  const resp = await fetch(url);
  if (!resp.ok || [530, 503, 502, 403, 400].includes(resp.status)) {
    console.log(`Failed request to ${url}, with status code: ${resp.status} and status text ${resp.statusText}`);
    return;
  }
  responseObject.found = true;
  let rewriter = new HTMLRewriter();
  await getMetaDescriptions(resp, rewriter, responseObject);
  await rewriter.transform(resp).arrayBuffer();
  await DEVTWO.put(url, JSON.stringify(responseObject), { expirationTtl: 604800 });
};

const getMetaDescriptions = async (resp: Response, rewriter: HTMLRewriter, values: ResponseObject) => {
  rewriter.on("head > meta", {
    element(element) {
      if (element.getAttribute("name") === "page-preview") {
        let description = element.getAttribute("content");
        if (description) {
          values["custom-description"] = description;
        }
      }
      if (element.getAttribute("name") === "custom-image") {
        let description = element.getAttribute("href");
        if (description) {
          values["custom-image"] = description;
        }
      }
      if (element.getAttribute("name") === "description") {
        let description = element.getAttribute("content");
        if (description) {
          values["metaDescription"] = description;
        }
      }
      if (element.getAttribute("property") === "og:image") {
        let description = element.getAttribute("content");
        if (description) {
          values["og:image"] = description;
        }
      }
      if (element.getAttribute("property") === "og:video:url") {
        let description = element.getAttribute("content");
        if (description) {
          values["og:video:url"] = description;
        }
      }
      if (element.getAttribute("name") === "twitter_player") {
        let description = element.getAttribute("content");
        if (description) {
          values["twitter_player"] = description;
        }
      }
      if (element.getAttribute("itemprop") === "embedURL") {
        let description = element.getAttribute("content");
        if (description) {
          values["embedURL"] = description;
        }
      }
    }
  }).on("link", {
    element(element) {
      if (element.getAttribute("itemprop") === "embedUrl") {
        let description = element.getAttribute("href");
        console.log("setting the itemprop", description);
        if (description) {
          values["embedURL"] = description;
        }
      }
    }
  }).on("title", {
    text(text) {
      if (text.text) {
        if (values["title"]) {
          values["title"] = values["title"] + text.text;
        } else {
          values["title"] = text.text;
        }
      }
    }
  });
};
