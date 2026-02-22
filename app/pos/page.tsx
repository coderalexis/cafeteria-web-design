import { createClient } from "@/lib/supabase/server"
import { PosForm } from "./pos-form"

export default async function PosPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("menu_variants")
    .select("id, name, price, menu_products(name)")
    .eq("is_active", true)
    .order("name")

  const variants =
    data?.map((variant) => ({
      id: variant.id,
      label: `${(variant.menu_products as { name: string } | null)?.name ?? "Producto"} - ${variant.name}`,
      price: variant.price,
    })) ?? []

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">POS · Registrar venta</h1>
      <PosForm variants={variants} />
    </main>
  )
}
