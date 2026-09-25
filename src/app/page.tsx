import FuzzyCity from "../components/FuzzyCity";
import { providerConfig } from "../ai/providerConfig";
export const dynamic = "force-dynamic";
export default function Page() {
  const provider = providerConfig().id;
  const price = (value: string | undefined) =>
    value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value)
      : null;
  return (
    <FuzzyCity
      mode={provider === "typesafe" || provider === "vercel" ? "live" : provider}
      hostedProvider={provider === "vercel" ? "vercel" : "typesafe"}
      pricing={{
        input: price(process.env.JEV_INPUT_PRICE_PER_MILLION),
        output: price(process.env.JEV_OUTPUT_PRICE_PER_MILLION),
      }}
    />
  );
}
