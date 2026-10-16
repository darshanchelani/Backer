import type { Provider } from "@prisma/client";
import type { Connector } from "./types";
import { stripeConnector } from "./stripe";
import { hubspotConnector } from "./hubspot";
import { mixpanelConnector } from "./mixpanel";

export const connectors: Partial<Record<Provider, Connector>> = {
  STRIPE: stripeConnector,
  HUBSPOT: hubspotConnector,
  MIXPANEL: mixpanelConnector,
};

export * from "./types";
