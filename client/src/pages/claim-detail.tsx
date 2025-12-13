import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useStore } from "@/lib/store";
import Layout from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Home,
  PenTool,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Save,
  Plus,
  Trash2,
  Camera,
  Move,
  X,
  Mic,
  Loader2,
  Settings2
} from "lucide-react";
import { Link } from "wouter";

import SketchCanvas from "@/components/sketch-canvas";
import DamageZoneModal from "@/components/damage-zone-modal";
import OpeningModal from "@/components/opening-modal";
import LineItemPicker from "@/components/line-item-picker";
import { Room, RoomOpening } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DoorOpen } from "lucide-react";

export default function ClaimDetail() {
  const [, params] = useRoute("/claim/:id");
  const {
    activeClaim: claim,
    setActiveClaim,
    addRoom,
    updateRoom,
    deleteRoom,
    addDamageZone,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    regions,
    carriers,
    estimateSettings,
    calculatedEstimate,
    isCalculating,
    estimateError,
    loadRegionsAndCarriers,
    setEstimateSettings,
    calculateEstimate,
  } = useStore();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isDamageModalOpen, setIsDamageModalOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState<RoomOpening | undefined>(undefined);
  const [isLineItemPickerOpen, setIsLineItemPickerOpen] = useState(false);
  const [isEstimateSettingsOpen, setIsEstimateSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    if (params?.id) {
      setActiveClaim(params.id);
    }
    return () => setActiveClaim(null);
  }, [params?.id, setActiveClaim]);

  // Load regions and carriers on mount
  useEffect(() => {
    loadRegionsAndCarriers();
  }, [loadRegionsAndCarriers]);

  if (!claim) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  const selectedRoom = claim.rooms.find(r => r.id === selectedRoomId);

  const handleAddRoom = () => {
    addRoom(claim.id, {
      id: `r${Date.now()}`,
      name: "New Room",
      type: "Bedroom",
      width: 12,
      height: 12,
      x: 0,
      y: 0,
      ceilingHeight: 8
    });
  };

  const handleSaveOpening = (openingData: Omit<RoomOpening, "id">) => {
    if (!selectedRoom) return;

    const existingOpenings = selectedRoom.openings || [];

    if (editingOpening) {
      // Update existing opening
      const updatedOpenings = existingOpenings.map((o) =>
        o.id === editingOpening.id ? { ...openingData, id: editingOpening.id } : o
      );
      updateRoom(claim.id, selectedRoom.id, { openings: updatedOpenings });
    } else {
      // Add new opening
      const newOpening: RoomOpening = {
        ...openingData,
        id: `op${Date.now()}`,
      };
      updateRoom(claim.id, selectedRoom.id, { openings: [...existingOpenings, newOpening] });
    }

    setEditingOpening(undefined);
  };

  const handleDeleteOpening = (openingId: string) => {
    if (!selectedRoom) return;
    const updatedOpenings = (selectedRoom.openings || []).filter((o) => o.id !== openingId);
    updateRoom(claim.id, selectedRoom.id, { openings: updatedOpenings });
  };

  const handleEditOpening = (opening: RoomOpening) => {
    setEditingOpening(opening);
    setIsOpeningModalOpen(true);
  };

  const handleAddOpeningClick = () => {
    setEditingOpening(undefined);
    setIsOpeningModalOpen(true);
  };

  const handleGenerateEstimate = async () => {
    if (claim.lineItems.length === 0) {
      setIsEstimateSettingsOpen(true);
      return;
    }
    const result = await calculateEstimate(claim.id);
    if (result) {
      setActiveTab("estimate");
    }
  };

  // Calculate display totals - use API result if available, otherwise use local subtotal
  const localSubtotal = claim.lineItems.reduce((sum, item) => sum + item.total, 0);
  const displaySubtotal = calculatedEstimate?.subtotal ?? localSubtotal;
  const displayOverhead = calculatedEstimate?.overheadAmount ?? (localSubtotal * (estimateSettings.overheadPct / 100));
  const displayProfit = calculatedEstimate?.profitAmount ?? (localSubtotal * (estimateSettings.profitPct / 100));
  const displayTax = calculatedEstimate?.taxAmount ?? 0;
  const displayTotal = calculatedEstimate?.grandTotal ?? (displaySubtotal + displayOverhead + displayProfit + displayTax);

  const tabs = [
    { id: "info", label: "Info", icon: Home },
    { id: "sketch", label: "Sketch", icon: PenTool },
    { id: "scope", label: "Scope", icon: ClipboardList },
    { id: "estimate", label: "Estimate", icon: FileText },
    { id: "photos", label: "Photos", icon: ImageIcon },
  ];

  return (
    <Layout>
      <div className="flex flex-col h-full relative">
        {/* Header */}
        <div className="bg-white border-b border-border px-4 md:px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-xl font-display font-bold text-slate-900 truncate max-w-[200px] md:max-w-none">{claim.customerName}</h1>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600 border border-slate-200 hidden md:inline-block">
                {claim.status.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-0.5 hidden md:block">{claim.policyNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden md:flex"
              onClick={() => setIsEstimateSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button
              size="sm"
              onClick={handleGenerateEstimate}
              disabled={isCalculating || claim.lineItems.length === 0}
            >
              {isCalculating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              <span className="hidden md:inline">Generate </span>Estimate
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden pb-nav-safe md:pb-0">
          {/* Desktop Tabs */}
          <div className="hidden md:block px-6 pt-2 bg-white border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 space-x-6">
              {tabs.map((tab) => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-primary transition-all"
                >
                  <tab.icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-muted/20 overflow-hidden relative">
            
            {/* TAB: PROPERTY INFO */}
            <TabsContent value="info" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Property Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Input value={claim.address.street} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input value={claim.address.city} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Input value={claim.address.state} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Zip Code</Label>
                        <Input value={claim.address.zip} readOnly />
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Property Type</Label>
                        <Select defaultValue="Single Family">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Single Family">Single Family</SelectItem>
                            <SelectItem value="Condo">Condo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Year Built</Label>
                        <Input defaultValue="1995" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Claim Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Carrier</Label>
                      <Input value={claim.carrier} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>Date of Loss</Label>
                      <Input type="date" value={claim.dateOfLoss} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>Loss Description</Label>
                      <textarea 
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                        value={claim.description}
                        readOnly
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB: SKETCH */}
            <TabsContent value="sketch" className="h-full m-0 flex flex-col">
              {/* Mobile View: Optimized for small screens */}
              <div className="md:hidden flex-1 flex flex-col overflow-hidden">
                {/* Canvas Area - Takes most of the space */}
                <div className="flex-1 min-h-0 relative border-b border-border overflow-hidden">
                   {/* Floating Toolbar - Compact */}
                   <div className="absolute top-2 left-2 right-2 flex justify-center z-30 pointer-events-none">
                     <div className="bg-white/95 backdrop-blur border shadow-sm rounded-full px-3 py-1.5 flex gap-1 pointer-events-auto">
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setSelectedRoomId(null)}>
                          <Move className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6 my-auto" />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleAddRoom}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6 my-auto" />
                        <Link href={`/voice-sketch/${claim.id}`}>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-primary">
                            <Mic className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <SketchCanvas
                      rooms={claim.rooms}
                      damageZones={claim.damageZones}
                      selectedRoomId={selectedRoomId}
                      onSelectRoom={setSelectedRoomId}
                      onUpdateRoom={(id, data) => updateRoom(claim.id, id, data)}
                    />
                </div>
                {/* Room Details Panel - Collapsible */}
                <div className={cn(
                  "bg-white transition-all duration-200 overflow-auto",
                  selectedRoom ? "h-auto max-h-[40%]" : "h-12"
                )}>
                    {selectedRoom ? (
                      <div className="p-3 space-y-3">
                         <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">{selectedRoom.name}</h3>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setSelectedRoomId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Name</Label>
                              <Input
                                className="h-9"
                                value={selectedRoom.name}
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Width (ft)</Label>
                              <Input
                                className="h-9"
                                type="number"
                                value={selectedRoom.width}
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { width: Number(e.target.value) })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Length (ft)</Label>
                              <Input
                                className="h-9"
                                type="number"
                                value={selectedRoom.height}
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { height: Number(e.target.value) })}
                              />
                            </div>
                          </div>
                          {/* Openings summary for mobile */}
                          {(selectedRoom.openings?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {selectedRoom.openings?.map((o) => (
                                <Badge key={o.id} variant="outline" className="text-amber-600 border-amber-200 text-xs">
                                  {o.type.replace("_", " ")} ({o.wall})
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button className="flex-1 h-9" variant="outline" onClick={handleAddOpeningClick}>
                              <DoorOpen className="h-4 w-4 mr-1" /> Door/Window
                            </Button>
                            <Button className="flex-1 h-9" variant="destructive" onClick={() => setIsDamageModalOpen(true)}>
                              Add Damage
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-9 px-3 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                deleteRoom(claim.id, selectedRoom.id);
                                setSelectedRoomId(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                      </div>
                    ) : (
                      <div className="p-3 text-center text-muted-foreground text-sm flex items-center justify-center h-full">
                        <span>Tap a room to edit • Pinch to zoom • Drag to pan</span>
                      </div>
                    )}
                </div>
              </div>

              {/* Desktop View: Resizable */}
              <div className="hidden md:block h-full">
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={65}>
                    <div className="h-full relative flex flex-col overflow-hidden">
                      <div className="absolute top-4 left-4 right-4 flex justify-center z-10 pointer-events-none">
                        <div className="bg-white/90 backdrop-blur border shadow-sm rounded-full px-4 py-2 flex gap-2 pointer-events-auto">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedRoomId(null)}>
                            <Move className="h-4 w-4 mr-2" /> Select
                          </Button>
                          <Separator orientation="vertical" className="h-6" />
                          <Button size="sm" variant="ghost" onClick={handleAddRoom}>
                            <Plus className="h-4 w-4 mr-2" /> Add Room
                          </Button>
                          <Separator orientation="vertical" className="h-6" />
                          <Link href={`/voice-sketch/${claim.id}`}>
                            <Button size="sm" variant="ghost" className="text-primary">
                              <Mic className="h-4 w-4 mr-2" /> Voice Sketch
                            </Button>
                          </Link>
                        </div>
                      </div>
                      <SketchCanvas 
                        rooms={claim.rooms} 
                        damageZones={claim.damageZones}
                        selectedRoomId={selectedRoomId}
                        onSelectRoom={setSelectedRoomId}
                        onUpdateRoom={(id, data) => updateRoom(claim.id, id, data)}
                      />
                    </div>
                  </ResizablePanel>
                  
                  <ResizableHandle />
                  
                  <ResizablePanel defaultSize={35} minSize={20}>
                    <div className="h-full bg-white border-l border-border flex flex-col">
                      <div className="p-4 border-b border-border bg-slate-50">
                        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">
                          {selectedRoom ? "Room Properties" : "Property Summary"}
                        </h3>
                      </div>
                      
                      <ScrollArea className="flex-1 p-4">
                        {selectedRoom ? (
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <Label>Room Name</Label>
                              <Input 
                                value={selectedRoom.name} 
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { name: e.target.value })} 
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Width (ft)</Label>
                                <Input 
                                  type="number" 
                                  value={selectedRoom.width} 
                                  onChange={(e) => updateRoom(claim.id, selectedRoom.id, { width: Number(e.target.value) })} 
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Length (ft)</Label>
                                <Input 
                                  type="number" 
                                  value={selectedRoom.height} 
                                  onChange={(e) => updateRoom(claim.id, selectedRoom.id, { height: Number(e.target.value) })} 
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Type</Label>
                              <Select 
                                value={selectedRoom.type} 
                                onValueChange={(v) => updateRoom(claim.id, selectedRoom.id, { type: v })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["Kitchen", "Bedroom", "Bathroom", "Living Room", "Dining Room", "Hallway", "Garage"].map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Ceiling Height</Label>
                              <Select 
                                value={String(selectedRoom.ceilingHeight)} 
                                onValueChange={(v) => updateRoom(claim.id, selectedRoom.id, { ceilingHeight: Number(v) })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["8", "9", "10", "12", "14"].map(h => (
                                    <SelectItem key={h} value={h}>{h} ft</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <Separator />

                            {/* Openings (Doors/Windows) */}
                            <div>
                              <h4 className="font-medium mb-3 flex items-center gap-2">
                                <DoorOpen className="h-4 w-4" />
                                Doors & Windows
                              </h4>
                              <div className="space-y-2 mb-3">
                                {(selectedRoom.openings || []).length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-2">No openings added yet</p>
                                ) : (
                                  selectedRoom.openings?.map((opening) => (
                                    <div
                                      key={opening.id}
                                      className="bg-amber-50 border border-amber-100 p-2 rounded text-sm flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors"
                                      onClick={() => handleEditOpening(opening)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="capitalize">{opening.type.replace("_", " ")}</span>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="text-muted-foreground capitalize">{opening.wall}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-amber-600 bg-white border-amber-200">
                                          {opening.width}' × {opening.height}'
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteOpening(opening.id);
                                          }}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                              <Button className="w-full" variant="outline" onClick={handleAddOpeningClick}>
                                <Plus className="h-4 w-4 mr-2" /> Add Door / Window
                              </Button>
                            </div>

                            <Separator />

                            <div>
                              <h4 className="font-medium mb-3">Damage Zones</h4>
                              <div className="space-y-2 mb-3">
                                {claim.damageZones.filter(dz => dz.roomId === selectedRoom.id).map(dz => (
                                  <div key={dz.id} className="bg-red-50 border border-red-100 p-2 rounded text-sm flex items-center justify-between">
                                    <span>{dz.type} - {dz.severity}</span>
                                    <Badge variant="outline" className="text-red-600 bg-white border-red-200">{dz.affectedArea} SF</Badge>
                                  </div>
                                ))}
                              </div>
                              <Button className="w-full" variant="destructive" onClick={() => setIsDamageModalOpen(true)}>
                                Add Damage Zone
                              </Button>
                            </div>

                            <div className="pt-4">
                              <Button 
                                variant="ghost" 
                                className="w-full text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  deleteRoom(claim.id, selectedRoom.id);
                                  setSelectedRoomId(null);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Room
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-6 text-center py-10">
                            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
                              <Move className="h-6 w-6" />
                            </div>
                            <p className="text-muted-foreground">
                              Select a room on the canvas to view details or add damage info.
                            </p>
                            <div className="p-4 bg-slate-50 rounded-lg border text-left space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Rooms:</span>
                                <span className="font-medium">{claim.rooms.length}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Area:</span>
                                <span className="font-medium">
                                  {claim.rooms.reduce((acc, r) => acc + (r.width * r.height), 0).toFixed(0)} SF
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </TabsContent>

            {/* TAB: SCOPE */}
            <TabsContent value="scope" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Scope of Work</h2>
                  <Button onClick={() => setIsLineItemPickerOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" /> <span className="hidden md:inline">Add Line Item</span>
                  </Button>
                </div>

                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 md:gap-4 p-4 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <div className="col-span-3 md:col-span-2">Code</div>
                    <div className="col-span-5 md:col-span-3">Description</div>
                    <div className="col-span-2 md:col-span-2 text-center">Qty</div>
                    <div className="hidden md:block col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 md:col-span-2 text-right">Total</div>
                    <div className="hidden md:block col-span-1"></div>
                  </div>

                  {claim.lineItems.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No line items added yet. Use the "Add Line Item" button to start building the estimate.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {claim.lineItems.map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 md:gap-4 p-4 text-sm items-center hover:bg-slate-50 group">
                          <div className="col-span-3 md:col-span-2 font-mono text-slate-600 text-xs md:text-sm">{item.code}</div>
                          <div className="col-span-5 md:col-span-3">
                            <p className="font-medium truncate">{item.description}</p>
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          </div>
                          <div className="col-span-2 md:col-span-2 flex items-center justify-center gap-1">
                            <div className="flex items-center border rounded-md">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-r-none"
                                onClick={() => {
                                  const newQty = Math.max(1, item.quantity - 1);
                                  updateLineItem(claim.id, item.id, {
                                    quantity: newQty,
                                    total: newQty * item.unitPrice
                                  });
                                }}
                              >
                                -
                              </Button>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newQty = Math.max(1, Number(e.target.value) || 1);
                                  updateLineItem(claim.id, item.id, {
                                    quantity: newQty,
                                    total: newQty * item.unitPrice
                                  });
                                }}
                                className="h-8 w-14 text-center border-0 rounded-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-l-none"
                                onClick={() => {
                                  const newQty = item.quantity + 1;
                                  updateLineItem(claim.id, item.id, {
                                    quantity: newQty,
                                    total: newQty * item.unitPrice
                                  });
                                }}
                              >
                                +
                              </Button>
                            </div>
                            <span className="text-xs text-muted-foreground hidden md:inline">{item.unit}</span>
                          </div>
                          <div className="hidden md:block col-span-2 text-right text-slate-600">
                            ${item.unitPrice.toFixed(2)}
                          </div>
                          <div className="col-span-2 md:col-span-2 text-right font-semibold">
                            ${item.total.toFixed(2)}
                          </div>
                          <div className="hidden md:flex col-span-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => deleteLineItem(claim.id, item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="p-4 bg-slate-50 border-t flex justify-end">
                    <div className="w-full md:w-72 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${displaySubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Overhead ({estimateSettings.overheadPct}%)</span>
                        <span>${displayOverhead.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Profit ({estimateSettings.profitPct}%)</span>
                        <span>${displayProfit.toFixed(2)}</span>
                      </div>
                      {displayTax > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Tax</span>
                          <span>${displayTax.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${displayTotal.toFixed(2)}</span>
                      </div>
                      {estimateError && (
                        <p className="text-xs text-destructive">{estimateError}</p>
                      )}
                      {!calculatedEstimate && claim.lineItems.length > 0 && (
                        <p className="text-xs text-muted-foreground">Click "Generate Estimate" to calculate with regional pricing</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB: ESTIMATE */}
            <TabsContent value="estimate" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-4xl mx-auto bg-white p-4 md:p-8 shadow-sm border min-h-[800px]">
                <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-display font-bold text-primary mb-2">ESTIMATE</h1>
                    <p className="text-muted-foreground">Created: {new Date().toLocaleDateString()}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <h2 className="text-xl font-bold">Claims IQ</h2>
                    <p className="text-sm text-muted-foreground">123 Insurance Way</p>
                    <p className="text-sm text-muted-foreground">New York, NY 10001</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                  <div>
                    <h3 className="text-sm font-semibold uppercase text-slate-500 mb-2">Insured</h3>
                    <p className="font-medium">{claim.customerName}</p>
                    <p>{claim.address.street}</p>
                    <p>{claim.address.city}, {claim.address.state} {claim.address.zip}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase text-slate-500 mb-2">Claim Info</h3>
                    <p><span className="text-muted-foreground">Claim #:</span> {claim.id.toUpperCase()}</p>
                    <p><span className="text-muted-foreground">Policy #:</span> {claim.policyNumber}</p>
                    <p><span className="text-muted-foreground">Loss Date:</span> {new Date(claim.dateOfLoss).toLocaleDateString()}</p>
                  </div>
                </div>

                <Separator className="my-8" />

                <div className="space-y-8">
                  <h3 className="font-bold text-lg">Room: {claim.rooms[0]?.name || "General"}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b-2 border-slate-900 text-left">
                          <th className="py-2 w-20">CODE</th>
                          <th className="py-2">DESCRIPTION</th>
                          <th className="py-2 w-20 text-right">QTY</th>
                          <th className="py-2 w-20 text-right">UNIT</th>
                          <th className="py-2 w-24 text-right">PRICE</th>
                          <th className="py-2 w-24 text-right">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {claim.lineItems.map((item) => (
                          <tr key={item.id}>
                            <td className="py-3 font-mono text-slate-600">{item.code}</td>
                            <td className="py-3">{item.description}</td>
                            <td className="py-3 text-right">{item.quantity}</td>
                            <td className="py-3 text-right">{item.unit}</td>
                            <td className="py-3 text-right">{item.unitPrice.toFixed(2)}</td>
                            <td className="py-3 text-right font-medium">{item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            {/* TAB: PHOTOS */}
            <TabsContent value="photos" className="h-full p-4 md:p-6 m-0 overflow-auto">
               <div className="max-w-6xl mx-auto">
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                   <div className="aspect-square bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 hover:border-primary/50 hover:text-primary cursor-pointer transition-colors">
                     <Camera className="h-8 w-8 mb-2" />
                     <span className="text-sm font-medium">Add Photo</span>
                   </div>
                   {/* Mock Photos */}
                   {[1, 2, 3].map((i) => (
                     <div key={i} className="aspect-square bg-slate-200 rounded-lg overflow-hidden relative group">
                       <img 
                         src={`https://images.unsplash.com/photo-158${i}578943-2c${i}2a4e2a?auto=format&fit=crop&w=300&q=80`} 
                         alt="Damage" 
                         className="w-full h-full object-cover"
                       />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                         <p className="text-white text-xs truncate">Damage Detail {i}</p>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </TabsContent>

          </div>

          {/* Mobile Bottom Nav */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 flex items-center justify-around h-nav-safe">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors min-tap-target pb-safe",
                    isActive ? "text-primary" : "text-slate-400 active:text-slate-600"
                  )}
                >
                  <tab.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </Tabs>
      </div>

      {/* Modals */}
      {selectedRoomId && (
        <DamageZoneModal
          isOpen={isDamageModalOpen}
          onClose={() => setIsDamageModalOpen(false)}
          roomId={selectedRoomId}
          onSave={(zone) => addDamageZone(claim.id, { ...zone, id: `dz${Date.now()}`, photos: [] })}
        />
      )}

      {selectedRoomId && (
        <OpeningModal
          isOpen={isOpeningModalOpen}
          onClose={() => {
            setIsOpeningModalOpen(false);
            setEditingOpening(undefined);
          }}
          onSave={handleSaveOpening}
          existingOpening={editingOpening}
        />
      )}

      <LineItemPicker
        isOpen={isLineItemPickerOpen}
        onClose={() => setIsLineItemPickerOpen(false)}
        onSelect={(item) => {
          addLineItem(claim.id, {
            ...item,
            quantity: 1, // Default to 1
            total: item.unitPrice,
            id: `li${Date.now()}`
          });
          setIsLineItemPickerOpen(false);
        }}
      />

      {/* Estimate Settings Dialog */}
      <Dialog open={isEstimateSettingsOpen} onOpenChange={setIsEstimateSettingsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Estimate Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select
                value={estimateSettings.regionId}
                onValueChange={(value) => setEstimateSettings({ regionId: value })}
              >
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name}{region.state ? `, ${region.state}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier">Carrier Profile</Label>
              <Select
                value={estimateSettings.carrierProfileId || "none"}
                onValueChange={(value) => setEstimateSettings({ carrierProfileId: value === "none" ? null : value })}
              >
                <SelectTrigger id="carrier">
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No carrier profile</SelectItem>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overhead">Overhead %</Label>
                <Input
                  id="overhead"
                  type="number"
                  min="0"
                  max="50"
                  value={estimateSettings.overheadPct}
                  onChange={(e) => setEstimateSettings({ overheadPct: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profit">Profit %</Label>
                <Input
                  id="profit"
                  type="number"
                  min="0"
                  max="50"
                  value={estimateSettings.profitPct}
                  onChange={(e) => setEstimateSettings({ profitPct: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            {estimateError && (
              <p className="text-sm text-destructive">{estimateError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEstimateSettingsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const result = await calculateEstimate(claim.id);
                if (result) {
                  setIsEstimateSettingsOpen(false);
                  setActiveTab("estimate");
                }
              }}
              disabled={isCalculating || claim.lineItems.length === 0}
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                'Generate Estimate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
