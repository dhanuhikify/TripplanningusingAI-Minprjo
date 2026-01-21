import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Calendar, Users, IndianRupee, Clock, Navigation2, Edit, Trash2, Leaf, Eye, TreePine, Hotel, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import Navigation from '@/components/Navigation';

interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: number | null;
  travelers: number;
  preferences: string[];
  ai_itinerary: any;
  status: string;
  created_at: string;
}

const TripDetail = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetchTrip();
  }, [tripId]);

  const fetchTrip = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setTrip(data);
    } catch (error: any) {
      toast({
        title: "Error fetching trip",
        description: error.message,
        variant: "destructive",
      });
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const deleteTrip = async () => {
    if (!trip) return;
    
    if (!confirm('Are you sure you want to delete this trip?')) return;

    try {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', trip.id);

      if (error) throw error;

      toast({
        title: "Trip deleted",
        description: "Your trip has been deleted successfully.",
      });
      
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: "Error deleting trip",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const regenerateItinerary = async () => {
    if (!trip) return;
    
    setRegenerating(true);
    try {
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('ai-trip-planner', {
        body: {
          tripId: trip.id,
          destination: trip.destination,
          startDate: trip.start_date,
          endDate: trip.end_date,
          travelers: trip.travelers,
          budget: trip.budget,
          preferences: trip.preferences || []
        }
      });

      if (aiError) {
        throw new Error(aiError.message || 'Failed to regenerate itinerary');
      }

      if (aiResponse?.error) {
        toast({
          title: "Regeneration failed",
          description: aiResponse.error.includes('temporarily busy') 
            ? "AI service is busy. Please try again in a few minutes."
            : aiResponse.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Itinerary regenerated!",
          description: "Your AI-powered itinerary has been updated.",
        });
        // Refresh the trip data
        await fetchTrip();
      }
    } catch (error: any) {
      toast({
        title: "Error regenerating itinerary",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'planned': return 'bg-primary text-primary-foreground';
      case 'active': return 'bg-success text-success-foreground';
      case 'completed': return 'bg-accent text-accent-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation showBack />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation showBack />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Trip not found</h2>
            <Button onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation showBack />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">{trip.title}</h1>
              <div className="flex items-center space-x-4 text-muted-foreground">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  {trip.destination}
                </div>
                <Badge className={getStatusColor(trip.status)}>
                  {trip.status}
                </Badge>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/trip/${trip.id}/edit`)}
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={deleteTrip}
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
          
          {/* Trip Info Cards */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="p-4 text-center">
                <Calendar className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-semibold">
                  {Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / (1000 * 60 * 60 * 24))} days
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Travelers</p>
                <p className="font-semibold">{trip.travelers}</p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="p-4 text-center">
                <IndianRupee className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Budget</p>
                <p className="font-semibold">{trip.budget ? `₹${trip.budget}` : 'Flexible'}</p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="p-4 text-center">
                <Clock className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Dates</p>
                <p className="font-semibold text-xs">
                  {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Content */}
        <Tabs defaultValue="itinerary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            <TabsTrigger value="places">AR/VR</TabsTrigger>
            <TabsTrigger value="timing">Best Time</TabsTrigger>
            <TabsTrigger value="eco">Eco-Friendly</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
          </TabsList>
          
          <TabsContent value="itinerary">
            <Card className="bg-gradient-card border-border/50 shadow-card-travel">
              <CardHeader>
                <CardTitle>AI-Generated Itinerary</CardTitle>
                <CardDescription>
                  Your personalized travel plan created by our AI assistant
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trip.ai_itinerary ? (
                  <div className="space-y-6">
                    {trip.ai_itinerary.overview && (
                      <div className="p-4 bg-primary/10 rounded-lg">
                        <h3 className="font-semibold mb-2 text-primary">Trip Overview</h3>
                        <p className="text-foreground">{trip.ai_itinerary.overview}</p>
                      </div>
                    )}
                    
                    {trip.ai_itinerary.dailyItinerary && trip.ai_itinerary.dailyItinerary.length > 0 ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Daily Itinerary</h3>
                        {trip.ai_itinerary.dailyItinerary.map((day: any, index: number) => (
                          <Card key={index} className="bg-background/50">
                            <CardHeader>
                              <CardTitle className="text-base">
                                Day {day.day} - {formatDate(day.date)}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {day.activities && (
                                <div className="space-y-3">
                                  {day.activities.map((activity: any, actIndex: number) => (
                                    <div key={actIndex} className="flex items-start space-x-3">
                                      <div className="w-16 text-sm text-muted-foreground font-mono">
                                        {activity.time}
                                      </div>
                                      <div className="flex-1">
                                        <h4 className="font-medium">{activity.activity}</h4>
                                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                                        {activity.location && (
                                          <p className="text-sm text-primary flex items-center mt-1">
                                            <Navigation2 className="w-3 h-3 mr-1" />
                                            {activity.location}
                                          </p>
                                        )}
                                        {activity.estimatedCost && (
                                          <p className="text-sm text-muted-foreground mt-1">
                                            Estimated cost: ₹{activity.estimatedCost}
                                          </p>
                                        )}
                                        {activity.crowdSize && (
                                          <div className="flex items-center mt-1">
                                            <Eye className="w-3 h-3 mr-1" />
                                            <span className={`text-sm px-2 py-0.5 rounded-full ${
                                              activity.crowdSize === 'Low' ? 'bg-green-100 text-green-700' :
                                              activity.crowdSize === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-red-100 text-red-700'
                                            }`}>
                                              {activity.crowdSize} crowds
                                            </span>
                                            {activity.isEcoFriendly && (
                                              <span className="ml-2 flex items-center text-green-600">
                                                <Leaf className="w-3 h-3 mr-1" />
                                                <span className="text-xs">Eco-friendly</span>
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {activity.bestTimeToAvoidCrowds && (
                                          <p className="text-xs text-primary mt-1">
                                            💡 Best time: {activity.bestTimeToAvoidCrowds}
                                          </p>
                                        )}
                                        {activity.tips && (
                                          <p className="text-sm text-primary mt-1">
                                            💡 {activity.tips}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {day.meals && (
                                <div className="mt-4 pt-4 border-t">
                                  <h4 className="font-medium mb-3">Meals</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {Object.entries(day.meals).map(([mealType, meal]: [string, any]) => (
                                      meal ? (
                                        <div key={mealType} className="bg-background/30 p-3 rounded-lg">
                                          <h5 className="font-medium capitalize text-sm">{mealType}</h5>
                                          <p className="text-sm">{meal.restaurant || 'TBD'}</p>
                                          <p className="text-xs text-muted-foreground">{meal.cuisine || ''}</p>
                                          {meal.estimatedCost && <p className="text-xs text-primary">₹{meal.estimatedCost}</p>}
                                        </div>
                                      ) : null
                                    ))}
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">
                          {trip.ai_itinerary.error
                            ? `AI planning failed: ${trip.ai_itinerary.error}`
                            : trip.ai_itinerary.rawContent
                              ? "AI planning completed, but formatting needs improvement."
                              : "AI itinerary is being generated..."
                          }
                        </p>
                        {trip.ai_itinerary.error && (
                          <Button 
                            onClick={regenerateItinerary} 
                            variant="outline"
                            disabled={regenerating}
                            className="mb-4"
                          >
                            <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                            {regenerating ? 'Regenerating...' : 'Regenerate Itinerary'}
                          </Button>
                        )}
                        {trip.ai_itinerary.rawContent && (
                          <div className="text-left bg-muted/50 p-4 rounded-lg">
                            <pre className="whitespace-pre-wrap text-sm">{String(trip.ai_itinerary.rawContent)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">Your AI itinerary is being generated...</p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <Button onClick={fetchTrip} variant="outline">
                        Refresh
                      </Button>
                      <Button
                        onClick={regenerateItinerary}
                        variant="outline"
                        disabled={regenerating}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                        {regenerating ? 'Generating...' : 'Generate Itinerary'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="places">
            <Card className="bg-gradient-card border-border/50 shadow-card-travel">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-primary" />
                  AR/VR Experience
                </CardTitle>
                <CardDescription>Explore locations with virtual maps and directions</CardDescription>
              </CardHeader>
              <CardContent>
                {trip.ai_itinerary?.dailyItinerary ? (
                  <div className="space-y-6">
                    {/* Accommodations Section */}
                    {trip.ai_itinerary.accommodation?.recommendations && 
                     trip.ai_itinerary.accommodation.recommendations.length > 0 && 
                     typeof trip.ai_itinerary.accommodation.recommendations[0] === 'object' && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                          <Hotel className="w-5 h-5" />
                          Recommended Stays
                        </h3>
                        <div className="grid gap-3">
                          {trip.ai_itinerary.accommodation.recommendations.map((accommodation: any, accIndex: number) => (
                            <div 
                              key={accIndex} 
                              className="flex items-center justify-between p-4 bg-accent/30 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-start gap-3 flex-1">
                                <Hotel className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold">{accommodation.name}</h4>
                                  <p className="text-sm text-muted-foreground flex items-center mt-1">
                                    <Navigation2 className="w-3 h-3 mr-1 flex-shrink-0" />
                                    {accommodation.location}
                                  </p>
                                  {accommodation.description && (
                                    <p className="text-sm mt-2 text-muted-foreground">{accommodation.description}</p>
                                  )}
                                  {accommodation.estimatedCostPerNight && (
                                    <p className="text-sm font-medium mt-2 flex items-center text-primary">
                                      <IndianRupee className="w-3 h-3" />
                                      {accommodation.estimatedCostPerNight}/night
                                    </p>
                                  )}
                                </div>
                              </div>
                              {accommodation.googleMapsLink && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(accommodation.googleMapsLink, '_blank')}
                                  className="ml-4 border-primary text-primary hover:bg-primary hover:text-primary-foreground flex-shrink-0"
                                >
                                  <MapPin className="w-4 h-4 mr-2" />
                                  Open Map
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Activities Section */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-primary">Attractions & Activities</h3>
                      <div className="grid gap-3">
                        {trip.ai_itinerary.dailyItinerary.map((day: any) => 
                          day.activities?.map((activity: any, actIndex: number) => (
                            <div 
                              key={`${day.day}-${actIndex}`} 
                              className="flex items-center justify-between p-4 bg-background/50 rounded-lg hover:bg-background/70 transition-colors"
                            >
                              <div className="flex-1">
                                <h4 className="font-medium">{activity.activity}</h4>
                                <p className="text-sm text-muted-foreground flex items-center mt-1">
                                  <Navigation2 className="w-3 h-3 mr-1" />
                                  {activity.location}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Day {day.day} - {activity.time}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const mapLink = activity.googleMapsLink || 
                                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.location || activity.activity)}`;
                                  window.open(mapLink, '_blank');
                                }}
                                className="ml-4 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                              >
                                <MapPin className="w-4 h-4 mr-2" />
                                Open Map
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Places and maps will appear once AI planning is complete.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="timing">
            <Card className="bg-gradient-card border-border/50 shadow-card-travel">
              <CardHeader>
                <CardTitle>Best Time to Visit</CardTitle>
                <CardDescription>Optimal timing for your destination</CardDescription>
              </CardHeader>
              <CardContent>
                {trip.ai_itinerary?.bestTimeToVisit ? (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-background/50 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2 flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-primary" />
                          Best Months
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {trip.ai_itinerary.bestTimeToVisit.months.map((month: string) => (
                            <Badge key={month} variant="outline" className="border-primary">
                              {month}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="bg-background/50 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2 flex items-center">
                          <Eye className="w-4 h-4 mr-2 text-primary" />
                          Crowd Level
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          trip.ai_itinerary.bestTimeToVisit.crowdLevel === 'Low' ? 'bg-green-100 text-green-700' :
                          trip.ai_itinerary.bestTimeToVisit.crowdLevel === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {trip.ai_itinerary.bestTimeToVisit.crowdLevel}
                        </span>
                      </div>
                    </div>
                    
                    <div className="bg-primary/10 p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">Weather</h3>
                      <p className="text-foreground">{trip.ai_itinerary.bestTimeToVisit.weather}</p>
                    </div>
                    
                    <div className="bg-background/50 p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">Why This Time?</h3>
                      <p className="text-muted-foreground">{trip.ai_itinerary.bestTimeToVisit.reason}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Best time information will appear once AI planning is complete.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="eco">
            <Card className="bg-gradient-card border-border/50 shadow-card-travel">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Leaf className="w-5 h-5 mr-2 text-green-600" />
                  Eco-Friendly Options
                </CardTitle>
                <CardDescription>Sustainable travel recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                {trip.ai_itinerary?.ecoFriendlySpots ? (
                  <div className="space-y-6">
                    <div className="grid gap-4">
                      {trip.ai_itinerary.ecoFriendlySpots.map((spot: any, index: number) => (
                        <Card key={index} className="bg-background/50">
                          <CardHeader>
                            <CardTitle className="text-base flex items-center">
                              <TreePine className="w-4 h-4 mr-2 text-green-600" />
                              {spot.name}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-muted-foreground mb-3">{spot.description}</p>
                            
                            {spot.activities && (
                              <div className="mb-3">
                                <h4 className="font-medium mb-2">Activities</h4>
                                <div className="flex flex-wrap gap-2">
                                  {spot.activities.map((activity: string, actIndex: number) => (
                                    <Badge key={actIndex} variant="outline" className="border-green-600 text-green-700">
                                      {activity}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {spot.tips && (
                              <div className="bg-green-50 p-3 rounded-lg">
                                <p className="text-sm text-green-800">
                                  <span className="font-medium">Responsible Travel Tip:</span> {spot.tips}
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    
                    {trip.ai_itinerary.sustainabilityTips && (
                      <div className="bg-green-50 p-4 rounded-lg">
                        <h3 className="font-semibold mb-3 text-green-800">Sustainability Tips</h3>
                        <ul className="space-y-2">
                          {trip.ai_itinerary.sustainabilityTips.map((tip: string, index: number) => (
                            <li key={index} className="text-sm text-green-700 flex items-start">
                              <Leaf className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {trip.ai_itinerary.accommodation?.ecoFriendlyOptions && (
                      <div className="bg-background/50 p-4 rounded-lg">
                        <h3 className="font-semibold mb-3">Eco-Friendly Accommodation</h3>
                        <div className="flex flex-wrap gap-2">
                          {trip.ai_itinerary.accommodation.ecoFriendlyOptions.map((option: string, index: number) => (
                            <Badge key={index} variant="outline" className="border-green-600">
                              {option}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {trip.ai_itinerary.transportation?.ecoFriendlyOptions && (
                      <div className="bg-background/50 p-4 rounded-lg">
                        <h3 className="font-semibold mb-3">Sustainable Transportation</h3>
                        <div className="flex flex-wrap gap-2">
                          {trip.ai_itinerary.transportation.ecoFriendlyOptions.map((option: string, index: number) => (
                            <Badge key={index} variant="outline" className="border-green-600">
                              {option}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Eco-friendly recommendations will appear once AI planning is complete.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="preferences">
            <Card className="bg-gradient-card border-border/50 shadow-card-travel">
              <CardHeader>
                <CardTitle>Travel Preferences</CardTitle>
                <CardDescription>The interests that shaped your itinerary</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {trip.preferences && trip.preferences.length > 0 ? (
                    trip.preferences.map((preference) => (
                      <Badge key={preference} variant="outline" className="border-primary">
                        {preference}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No preferences specified</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="budget">
            <Card className="bg-gradient-card border-border/50 shadow-card-travel">
              <CardHeader>
                <CardTitle>Budget Information</CardTitle>
                <CardDescription>Financial planning for your trip</CardDescription>
              </CardHeader>
              <CardContent>
                {trip.ai_itinerary?.budgetBreakdown ? (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(trip.ai_itinerary.budgetBreakdown).map(([category, amount]) => (
                        <div key={category} className="flex justify-between items-center p-3 bg-background/50 rounded-lg">
                          <span className="capitalize">{category.replace(/([A-Z])/g, ' $1')}</span>
                          <span className="font-semibold">₹{String(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">
                      Budget: {trip.budget ? `₹${trip.budget}` : 'Flexible budget'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Detailed budget breakdown will appear once AI planning is complete.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TripDetail;