
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { CMSAuthProvider } from "@/contexts/CMSAuthContext";
import { CMSProvider } from "@/contexts/CMSContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ProductCategory from "./pages/ProductCategory";
import CMSLogin from "./pages/CMSLogin";
import CMSDashboard from "./pages/CMSDashboard";
import CompanyProfile from "./pages/CompanyProfile";
import { RequireCMSAuth } from "@/components/RequireCMSAuth";
import { RouteErrorBoundary } from "@/components/RouteErrorFallback";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CMSAuthProvider>
          <CMSProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/products/:category" element={<ProductCategory />} />
                <Route path="/login" element={<CMSLogin />} />
                <Route
                  path="/cms"
                  element={
                    <RequireCMSAuth>
                      <RouteErrorBoundary>
                        <CMSDashboard />
                      </RouteErrorBoundary>
                    </RequireCMSAuth>
                  }
                />
                <Route path="/company-profile" element={<CompanyProfile />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CMSProvider>
        </CMSAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
