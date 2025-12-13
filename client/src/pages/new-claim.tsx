import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function NewClaim() {
  const [, setLocation] = useLocation();
  const createClaim = useStore((state) => state.createClaim);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    customerName: "",
    policyNumber: "",
    carrier: "SafeGuard Insurance",
    street: "",
    city: "",
    state: "",
    zip: "",
    type: "Water",
    description: "",
    dateOfLoss: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Mock API delay
    setTimeout(() => {
      createClaim({
        customerName: formData.customerName,
        policyNumber: formData.policyNumber,
        carrier: formData.carrier,
        status: 'draft',
        address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip
        },
        type: formData.type as any,
        description: formData.description,
        dateOfLoss: formData.dateOfLoss,
        rooms: [],
        damageZones: [],
        lineItems: []
      });
      setLoading(false);
      setLocation("/");
    }, 800);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-6 md:p-8">
        <h1 className="text-3xl font-display font-bold text-slate-900 mb-6">Create New Claim</h1>
        
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Claim Information</CardTitle>
              <CardDescription>Enter the initial details for the new claim.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer Name</Label>
                  <Input 
                    id="customerName" 
                    required 
                    value={formData.customerName}
                    onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="policyNumber">Policy Number</Label>
                  <Input 
                    id="policyNumber" 
                    required 
                    value={formData.policyNumber}
                    onChange={(e) => setFormData({...formData, policyNumber: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>
                <Input 
                  id="street" 
                  required 
                  value={formData.street}
                  onChange={(e) => setFormData({...formData, street: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input 
                    id="city" 
                    required 
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input 
                    id="state" 
                    required 
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">Zip Code</Label>
                  <Input 
                    id="zip" 
                    required 
                    value={formData.zip}
                    onChange={(e) => setFormData({...formData, zip: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Claim Type</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(v) => setFormData({...formData, type: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Water", "Fire", "Wind/Hail", "Impact", "Other"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfLoss">Date of Loss</Label>
                  <Input 
                    id="dateOfLoss" 
                    type="date" 
                    required 
                    value={formData.dateOfLoss}
                    onChange={(e) => setFormData({...formData, dateOfLoss: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description of Loss</Label>
                <Textarea 
                  id="description" 
                  className="min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLocation("/")}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Claim"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </Layout>
  );
}
