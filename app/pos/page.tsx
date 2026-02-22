"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trash2, Coffee, ShoppingBag, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SizeOption {
  label: string
  oz: string
  price: number
}

interface Product {
  id: string
  name: string
  price?: number
  sizes?: SizeOption[]
  category: string
  subcategory: string
  description?: string
}

interface CartItem {
  cartId: string
  product: Product
  size?: SizeOption
  quantity: number
  isNew?: boolean
}

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */
const categories = [
  { id: "todos", label: "Todos" },
  { id: "con-cafe", label: "Con Cafe" },
  { id: "a-base-de-leche", label: "A Base de Leche" },
  { id: "frappes", label: "Frappes" },
  { id: "infusiones", label: "Infusiones" },
  { id: "sodas", label: "Sodas Italianas" },
  { id: "crepas-dulces", label: "Crepas Dulces" },
  { id: "crepas-saladas", label: "Crepas Saladas" },
  { id: "croissants", label: "Croissants" },
  { id: "panaderia", label: "Panaderia" },
  { id: "extras", label: "Extras" },
]

/* ------------------------------------------------------------------ */
/*  Products – full menu from "El Cafecito"                            */
/* ------------------------------------------------------------------ */
const products: Product[] = [
  // ── CON CAFÉ ──────────────────────────────────────────────────────
  {
    id: "espresso",
    name: "Espresso",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "1 oz", price: 20 },
      { label: "Grande", oz: "2 oz", price: 40 },
    ],
  },
  {
    id: "espresso-cortado",
    name: "Espresso Cortado",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "1.5 oz", price: 25 },
      { label: "Grande", oz: "3 oz", price: 45 },
    ],
  },
  {
    id: "americano",
    name: "Americano",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 30 },
      { label: "Grande", oz: "16 oz", price: 40 },
      { label: "Frio", oz: "16 oz", price: 40 },
    ],
  },
  {
    id: "flat-white",
    name: "Flat White",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 50 },
      { label: "Grande", oz: "16 oz", price: 60 },
    ],
  },
  {
    id: "cappuccino",
    name: "Cappuccino",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "10 oz", price: 35 },
      { label: "Grande", oz: "16 oz", price: 45 },
    ],
  },
  {
    id: "latte",
    name: "Latte",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 45 },
      { label: "Grande", oz: "16 oz", price: 60 },
      { label: "Frio", oz: "16 oz", price: 60 },
    ],
  },
  {
    id: "mocha",
    name: "Mocha",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 55 },
      { label: "Grande", oz: "16 oz", price: 65 },
      { label: "Frio", oz: "16 oz", price: 65 },
    ],
  },
  {
    id: "dirty-chai",
    name: "Dirty Chai",
    description: "Cafe + Chai Latte",
    category: "con-cafe",
    subcategory: "Con Cafe",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 60 },
      { label: "Grande", oz: "16 oz", price: 70 },
      { label: "Frio", oz: "16 oz", price: 75 },
    ],
  },

  // ── A BASE DE LECHE ───────────────────────────────────────────────
  ...[
    "Taro",
    "Matcha Latte",
    "Chocolate",
    "Choco/Banana",
    "Cookies and Cream",
    "Chai Latte",
    "Mazapan",
    "Choco/Menta",
    "Cajeta",
    "Malvavisco Tostado",
    "Fresas con Crema",
  ].map((flavor) => ({
    id: `leche-${flavor.toLowerCase().replace(/[\s/]+/g, "-")}`,
    name: flavor,
    category: "a-base-de-leche",
    subcategory: "A Base de Leche",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 55 },
      { label: "Grande", oz: "16 oz", price: 65 },
      { label: "Frio", oz: "16 oz", price: 65 },
    ],
  })),

  // ── FRAPPES – A BASE DE LECHE ─────────────────────────────────────
  ...[
    "Cappuccino",
    "Cookies and Cream",
    "Choco/Menta",
    "Matcha",
    "Choco/Banana",
    "Fresas con Crema",
    "Taro",
    "Mazapan",
    "Cajeta",
    "Malvavisco Tostado",
  ].map((flavor) => ({
    id: `frappe-leche-${flavor.toLowerCase().replace(/[\s/]+/g, "-")}`,
    name: `${flavor}`,
    description: "Frappe a base de leche",
    category: "frappes",
    subcategory: "Frappe Leche",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 45 },
      { label: "Grande", oz: "16 oz", price: 60 },
    ],
  })),

  // ── FRAPPES – A BASE DE AGUA ──────────────────────────────────────
  ...[
    "Fresa",
    "Maracuya",
    "Mango",
    "Moras",
    "Manzana Verde",
    "Sandia/Limon",
    "Pina",
    "Mojito",
  ].map((flavor) => ({
    id: `frappe-agua-${flavor.toLowerCase().replace(/[\s/]+/g, "-")}`,
    name: `${flavor}`,
    description: "Frappe a base de agua",
    category: "frappes",
    subcategory: "Frappe Agua",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 45 },
      { label: "Grande", oz: "16 oz", price: 60 },
    ],
  })),

  // ── INFUSIONES ────────────────────────────────────────────────────
  ...[
    "Frambuesa/Hibiscos",
    "Jengibre/Limon",
    "Manzana/Canela",
    "Naranja/Jengibre",
    "Frutos del Bosque",
    "Mango/Frutos de la Pasion",
    "Chocolate/Avellana",
    "Fresa/Mango",
    "Te Negro/Bergamotta",
    "Abango con Propoleo",
  ].map((flavor) => ({
    id: `infusion-${flavor.toLowerCase().replace(/[\s/]+/g, "-")}`,
    name: flavor,
    category: "infusiones",
    subcategory: "Infusiones",
    sizes: [
      { label: "Chico", oz: "12 oz", price: 35 },
      { label: "Grande", oz: "16 oz", price: 40 },
      { label: "Frio", oz: "16 oz", price: 40 },
    ],
  })),

  // ── SODAS ITALIANAS ───────────────────────────────────────────────
  ...[
    "Mango",
    "Petalos de Rosa",
    "Sandia/Limon",
    "Maracuya",
    "Fresa",
    "Moras",
    "Manzana Verde",
    "Pina",
    "Mojito",
  ].map((flavor) => ({
    id: `soda-${flavor.toLowerCase().replace(/[\s/]+/g, "-")}`,
    name: flavor,
    description: "Frio 16 oz",
    category: "sodas",
    subcategory: "Sodas Italianas",
    price: 60,
  })),

  // ── CREPAS DULCES ─────────────────────────────────────────────────
  {
    id: "crepa-sencilla",
    name: "Crepa Sencilla",
    description: "1 ingrediente",
    price: 35,
    category: "crepas-dulces",
    subcategory: "Crepas Dulces",
  },
  {
    id: "crepa-doble",
    name: "Crepa Doble",
    description: "2 ingredientes",
    price: 45,
    category: "crepas-dulces",
    subcategory: "Crepas Dulces",
  },
  {
    id: "crepa-bosque-philadelphia",
    name: "Frutos del Bosque y Philadelphia",
    description: "Las Favoritas",
    price: 45,
    category: "crepas-dulces",
    subcategory: "Las Favoritas",
  },
  {
    id: "crepa-manzana-nuez",
    name: "Manzana, Canela, Nuez y Philadelphia",
    description: "Las Favoritas",
    price: 55,
    category: "crepas-dulces",
    subcategory: "Las Favoritas",
  },
  {
    id: "crepa-platano-nutella",
    name: "Platano, Nutella y Nuez",
    description: "Las Favoritas",
    price: 55,
    category: "crepas-dulces",
    subcategory: "Las Favoritas",
  },
  {
    id: "crepa-fresas-platano",
    name: "Fresas, Platano y Philadelphia",
    description: "Las Favoritas",
    price: 55,
    category: "crepas-dulces",
    subcategory: "Las Favoritas",
  },
  {
    id: "crepa-bosque-nutella",
    name: "Frutos del Bosque y Nutella",
    description: "Las Favoritas",
    price: 55,
    category: "crepas-dulces",
    subcategory: "Las Favoritas",
  },
  {
    id: "ingrediente-extra",
    name: "Ingrediente Extra (Crepa)",
    price: 10,
    category: "crepas-dulces",
    subcategory: "Crepas Dulces",
  },

  // ── CREPAS SALADAS ────────────────────────────────────────────────
  {
    id: "crepa-jamon-queso",
    name: "Jamon y Queso Manchego",
    price: 45,
    category: "crepas-saladas",
    subcategory: "Crepas Saladas",
  },
  {
    id: "crepa-peperoni",
    name: "Peperoni, Queso Manchego y Salsa",
    price: 45,
    category: "crepas-saladas",
    subcategory: "Crepas Saladas",
  },
  {
    id: "crepa-champinon",
    name: "Champinon, Tocino, Queso Manchego",
    price: 55,
    category: "crepas-saladas",
    subcategory: "Crepas Saladas",
  },
  {
    id: "crepa-jamon-pina",
    name: "Jamon, Queso Manchego y Pina",
    price: 55,
    category: "crepas-saladas",
    subcategory: "Crepas Saladas",
  },

  // ── CROISSANTS ────────────────────────────────────────────────────
  {
    id: "croissant-peperoni",
    name: "Croissant Peperoni",
    description: "Peperoni, Queso Manchego y Salsa de Tomate",
    price: 45,
    category: "croissants",
    subcategory: "Croissant Salado",
  },
  {
    id: "croissant-jamon",
    name: "Croissant Jamon",
    description: "Jamon de Pavo, Queso Manchego, Lechuga y Mayonesa",
    price: 45,
    category: "croissants",
    subcategory: "Croissant Salado",
  },
  {
    id: "choco-croissant",
    name: "Choco-Croissant",
    description: "Nutella, Platano y Crema Batida",
    price: 55,
    category: "croissants",
    subcategory: "Croissant Dulce",
  },
  {
    id: "croissant-bosque",
    name: "Croissant Frutos del Bosque",
    description: "Frutos del Bosque, Nutella, Crema Batida",
    price: 55,
    category: "croissants",
    subcategory: "Croissant Dulce",
  },

  // ── PANADERIA ─────────────────────────────────────────────────────
  ...(["Zanahoria", "Limon", "Manzana"] as const).map((s) => ({
    id: `panque-${s.toLowerCase()}`,
    name: `Panque de ${s}`,
    price: 20,
    category: "panaderia" as const,
    subcategory: "Rebanada de Panque",
  })),
  {
    id: "panque-platano",
    name: "Panque de Platano",
    price: 15,
    category: "panaderia",
    subcategory: "Rebanada de Panque",
  },
  {
    id: "panque-vainilla-choco",
    name: "Panque Vainilla y Chocolate",
    price: 25,
    category: "panaderia",
    subcategory: "Rebanada de Panque",
  },
  {
    id: "panque-brownie",
    name: "Brownie",
    price: 25,
    category: "panaderia",
    subcategory: "Rebanada de Panque",
  },
  ...(["Fresa", "Chocolate", "Vainilla y Frutos Rojos", "Arcoiris"] as const).map((s) => ({
    id: `cupcake-${s.toLowerCase().replace(/[\s/]+/g, "-")}`,
    name: `Cupcake ${s}`,
    price: 15,
    category: "panaderia" as const,
    subcategory: "Cupcakes",
  })),

  // ── EXTRAS ────────────────────────────────────────────────────────
  { id: "shot-crema", name: "Shot de Crema Batida", price: 10, category: "extras", subcategory: "Extras" },
  { id: "shot-cafe", name: "Shot de Cafe", price: 5, category: "extras", subcategory: "Extras" },
  { id: "shot-leche", name: "Shot de Leche", price: 7, category: "extras", subcategory: "Extras" },
  {
    id: "saborizante-chico",
    name: "Saborizante Chico",
    description: "Amaretto, Menta, Avellana, Caramelo, etc.",
    price: 5,
    category: "extras",
    subcategory: "Saborizantes",
  },
  {
    id: "saborizante-grande",
    name: "Saborizante Grande",
    description: "Amaretto, Menta, Avellana, Caramelo, etc.",
    price: 10,
    category: "extras",
    subcategory: "Saborizantes",
  },
  {
    id: "saborizante-frio",
    name: "Saborizante Frio",
    description: "En las rocas",
    price: 10,
    category: "extras",
    subcategory: "Saborizantes",
  },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getDisplayPrice(p: Product): string {
  if (p.price !== undefined) return `$${p.price}`
  if (p.sizes && p.sizes.length > 0) {
    const min = Math.min(...p.sizes.map((s) => s.price))
    const max = Math.max(...p.sizes.map((s) => s.price))
    return min === max ? `$${min}` : `$${min} - $${max}`
  }
  return ""
}

function getItemPrice(item: CartItem): number {
  return item.size ? item.size.price : item.product.price ?? 0
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function CafePOS() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [totalSales, setTotalSales] = useState<number>(0)
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false)
  const [activeCategory, setActiveCategory] = useState<string>("todos")
  const [sizePickerFor, setSizePickerFor] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("totalSales")
    if (saved) setTotalSales(Number.parseFloat(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem("totalSales", totalSales.toString())
  }, [totalSales])

  /* filtered & grouped products */
  const filtered =
    activeCategory === "todos"
      ? products
      : products.filter((p) => p.category === activeCategory)

  const grouped = filtered.reduce<Record<string, Product[]>>((acc, p) => {
    const key = p.subcategory
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  /* cart helpers */
  const addToCart = useCallback((product: Product, size?: SizeOption) => {
    const cartId = size ? `${product.id}__${size.label}` : product.id

    setCart((prev) => {
      const existing = prev.find((i) => i.cartId === cartId)
      if (existing) {
        return prev.map((i) =>
          i.cartId === cartId ? { ...i, quantity: i.quantity + 1, isNew: true } : { ...i, isNew: false }
        )
      }
      return [
        ...prev.map((i) => ({ ...i, isNew: false })),
        { cartId, product, size, quantity: 1, isNew: true },
      ]
    })

    setTimeout(() => {
      setCart((prev) => prev.map((i) => ({ ...i, isNew: false })))
    }, 350)
  }, [])

  const removeFromCart = useCallback((cartId: string) => {
    setCart((prev) => prev.filter((i) => i.cartId !== cartId))
  }, [])

  const updateQuantity = useCallback((cartId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.cartId === cartId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    )
  }, [])

  const total = cart.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0)

  const finalizeSale = () => {
    setTotalSales((prev) => prev + total)
    setCart([])
    setShowConfirmation(true)
    setTimeout(() => setShowConfirmation(false), 2000)
  }

  const handleProductClick = (product: Product) => {
    if (product.sizes && product.sizes.length > 0) {
      setSizePickerFor(sizePickerFor === product.id ? null : product.id)
    } else {
      addToCart(product)
      setSizePickerFor(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">
      {/* ───── LEFT PANEL (Products) ───── */}
      <div className="w-3/5 flex flex-col h-full border-r border-stone-200">
        {/* Header */}
        <header className="shrink-0 px-5 pt-4 pb-3 bg-white border-b border-stone-200 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Coffee className="h-6 w-6 text-amber-700" />
              <h1 className="text-2xl font-bold text-stone-800 tracking-tight">El Cafecito</h1>
            </div>
            <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl flex items-center gap-2">
              <span className="text-sm text-amber-800 font-medium">Total vendido hoy:</span>
              <span className="text-xl font-bold text-amber-800">${totalSales.toFixed(2)}</span>
            </div>
          </div>

          {/* Categories scroll */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "outline"}
                onClick={() => {
                  setActiveCategory(cat.id)
                  setSizePickerFor(null)
                }}
                className={`rounded-full shrink-0 text-sm ${
                  activeCategory === cat.id
                    ? "bg-amber-700 hover:bg-amber-800 text-white"
                    : "border-stone-300 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </header>

        {/* Product grid */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {Object.entries(grouped).map(([subcategory, items]) => (
              <div key={subcategory}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1">
                  {subcategory}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map((product) => (
                    <div key={product.id}>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleProductClick(product)}
                        className={`w-full text-left rounded-xl border transition-all duration-150 overflow-hidden ${
                          sizePickerFor === product.id
                            ? "border-amber-400 bg-amber-50 shadow-md"
                            : "border-stone-200 bg-white hover:border-amber-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="p-3">
                          <p className="font-semibold text-stone-800 text-sm leading-tight line-clamp-2">
                            {product.name}
                          </p>
                          {product.description && (
                            <p className="text-xs text-stone-400 mt-0.5 truncate">{product.description}</p>
                          )}
                          <p className="text-amber-700 font-bold text-base mt-1">{getDisplayPrice(product)}</p>
                        </div>
                      </motion.button>

                      {/* Size picker – inline below the card */}
                      <AnimatePresence>
                        {sizePickerFor === product.id && product.sizes && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-1.5 mt-1.5">
                              {product.sizes.map((size) => (
                                <motion.button
                                  key={size.label}
                                  whileTap={{ scale: 0.92 }}
                                  onClick={() => {
                                    addToCart(product, size)
                                    setSizePickerFor(null)
                                  }}
                                  className="flex-1 py-2 px-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-center transition-colors"
                                >
                                  <span className="block text-xs font-bold">{size.label}</span>
                                  <span className="block text-[10px] opacity-80">{size.oz}</span>
                                  <span className="block text-xs font-bold mt-0.5">${size.price}</span>
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ───── RIGHT PANEL (Cart) ───── */}
      <div className="w-2/5 flex flex-col h-full bg-white">
        <header className="shrink-0 px-5 py-4 border-b border-stone-200 bg-amber-50/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-bold text-stone-800">Venta Actual</h2>
            </div>
            {cart.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                {cart.reduce((s, i) => s + i.quantity, 0)} items
              </Badge>
            )}
          </div>
        </header>

        {/* Cart items */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {cart.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-stone-300">
                <ShoppingBag className="h-14 w-14 mb-3 opacity-40" />
                <p className="text-base font-medium text-stone-400">No hay productos</p>
                <p className="text-sm text-stone-300">Toca un producto para agregarlo</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {cart.map((item) => (
                  <motion.div
                    key={item.cartId}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      backgroundColor: item.isNew ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0)",
                    }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-between py-3 border-b border-stone-100 rounded-lg px-2 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-800 text-sm truncate">{item.product.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-stone-400">
                          ${getItemPrice(item).toFixed(2)}
                        </span>
                        {item.size && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-stone-300 text-stone-500">
                            {item.size.label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full border-stone-300 text-stone-500"
                        onClick={() => updateQuantity(item.cartId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold text-stone-700">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full border-stone-300 text-stone-500"
                        onClick={() => updateQuantity(item.cartId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <span className="font-bold text-sm text-stone-800 w-16 text-right">
                      ${(getItemPrice(item) * item.quantity).toFixed(2)}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 shrink-0"
                      onClick={() => removeFromCart(item.cartId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>

        {/* Checkout */}
        <div className="shrink-0 p-4 border-t border-stone-200 bg-stone-50/80">
          <div className="flex justify-between items-center mb-3">
            <span className="text-base font-medium text-stone-500">Total</span>
            <span className="text-2xl font-bold text-stone-800">${total.toFixed(2)}</span>
          </div>
          <Button
            className="w-full py-6 text-lg font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors"
            size="lg"
            disabled={cart.length === 0}
            onClick={finalizeSale}
          >
            Cobrar ${total.toFixed(2)}
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-2xl text-green-600">Venta Exitosa</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base">
              La venta ha sido registrada correctamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction className="bg-green-600 hover:bg-green-700 text-white">Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
