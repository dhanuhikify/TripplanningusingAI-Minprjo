import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, MapPin, Users, DollarSign, Brain, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import Navigation from '@/components/Navigation';

const TripPlanner = () => {
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchingTrip, setFetchingTrip] = useState(!!tripId);
  const [formData, setFormData] = useState({
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    budget: '',
    travelers: 1,
    preferences: [] as string[],
  });

  const isEditMode = !!tripId;

  useEffect(() => {
    if (tripId) {
      fetchTrip();
    }
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

      setFormData({
        title: data.title,
        destination: data.destination,
        startDate: data.start_date,
        endDate: data.end_date,
        budget: data.budget?.toString() || '',
        travelers: data.travelers,
        preferences: data.preferences || [],
      });
    } catch (error: any) {
      toast({
        title: "Error fetching trip",
        description: error.message,
        variant: "destructive",
      });
      navigate('/dashboard');
    } finally {
      setFetchingTrip(false);
    }
  };

  const preferencesOptions = [
    'Adventure', 'Culture', 'Relaxation', 'Food & Drinks', 'Nature',
    'Museums', 'Nightlife', 'Shopping', 'Beach', 'Mountains',
    'Photography', 'History', 'Art', 'Music', 'Sports'
  ];

  const handlePreferenceToggle = (preference: string) => {
    setFormData(prev => ({
      ...prev,
      preferences: prev.preferences.includes(preference)
        ? prev.preferences.filter(p => p !== preference)
        : [...prev.preferences, preference]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      if (isEditMode) {
        // Update existing trip
        const { error: updateError } = await supabase
          .from('trips')
          .update({
            title: formData.title,
            destination: formData.destination,
            start_date: formData.startDate,
            end_date: formData.endDate,
            budget: formData.budget ? parseFloat(formData.budget) : null,
            travelers: formData.travelers,
            preferences: formData.preferences,
          })
          .eq('id', tripId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;

        toast({
          title: "Trip updated!",
          description: "Your trip has been updated successfully.",
        });

        navigate(`/trip/${tripId}`);
      } else {
        // Create the trip in database
        const { data: trip, error: tripError } = await supabase
          .from('trips')
          .insert({
            user_id: user.id,
            title: formData.title,
            destination: formData.destination,
            start_date: formData.startDate,
            end_date: formData.endDate,
            budget: formData.budget ? parseFloat(formData.budget) : null,
            travelers: formData.travelers,
            preferences: formData.preferences,
            status: 'draft'
          })
          .select()
          .single();

        if (tripError) throw tripError;

        // Call AI planning edge function
        const { data: aiResponse, error: aiError } = await supabase.functions.invoke('ai-trip-planner', {
          body: {
            tripId: trip.id,
            destination: formData.destination,
            startDate: formData.startDate,
            endDate: formData.endDate,
            travelers: formData.travelers,
            budget: formData.budget ? parseFloat(formData.budget) : null,
            preferences: formData.preferences
          }
        });

        if (aiError) {
          console.error('AI planning error:', aiError);
          toast({
            title: "Trip created!",
            description: "AI planning couldn't start. Open the trip and tap Generate Itinerary to try again.",
          });
        } else if (aiResponse?.error || aiResponse?.retryable) {
          // Handle rate limiting or other AI errors
          const errorMsg = aiResponse?.error || 'AI service temporarily unavailable';
          console.error('AI response error:', errorMsg);
          toast({
            title: "Trip created with limited planning",
            description: errorMsg.includes('temporarily busy') 
              ? "AI service is busy. Please try regenerating the itinerary in a few minutes."
              : errorMsg,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Trip planned successfully!",
            description: "Your AI-powered itinerary has been generated.",
          });
        }

        navigate(`/trip/${trip.id}`);
      }
    } catch (error: any) {
      console.error('Trip planning error:', error);
      toast({
        title: isEditMode ? "Error updating trip" : "Error planning trip",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetchingTrip) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation showBack />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation showBack />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isEditMode ? 'Edit Your Trip' : 'Plan Your Perfect Trip'}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode 
              ? 'Update your trip details and preferences'
              : 'Tell us about your dream destination and let our AI create a personalized itinerary'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <Card className="bg-gradient-card border-border/50 shadow-card-travel">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-primary" />
                Trip Details
              </CardTitle>
              <CardDescription>Basic information about your upcoming journey</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Trip Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., European Adventure"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Input
                    id="destination"
                    placeholder="e.g., Paris, France"
                    value={formData.destination}
                    onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <div className="relative">
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                      required
                    />
                    <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <div className="relative">
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                      required
                    />
                    <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="travelers">Number of Travelers</Label>
                  <div className="relative">
                    <Input
                      id="travelers"
                      type="number"
                      min="1"
                      max="20"
                      value={formData.travelers}
                      onChange={(e) => setFormData(prev => ({ ...prev, travelers: parseInt(e.target.value) || 1 }))}
                      required
                    />
                    <Users className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget in ₹ (Optional)</Label>
                  <div className="relative">
                    <Input
                      id="budget"
                      type="number"
                      placeholder="50000"
                      value={formData.budget}
                      onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                    />
                    <span className="absolute right-3 top-3 text-sm text-muted-foreground pointer-events-none">₹</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card className="bg-gradient-card border-border/50 shadow-card-travel">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Brain className="w-5 h-5 mr-2 text-primary" />
                Travel Preferences
              </CardTitle>
              <CardDescription>Select what interests you most (helps AI create better recommendations)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {preferencesOptions.map((preference) => (
                  <Badge
                    key={preference}
                    variant={formData.preferences.includes(preference) ? "default" : "outline"}
                    className={`cursor-pointer text-center py-2 transition-smooth ${
                      formData.preferences.includes(preference)
                        ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                        : 'hover:bg-primary/10 border-primary/50'
                    }`}
                    onClick={() => handlePreferenceToggle(preference)}
                  >
                    {preference}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-hero text-white shadow-travel hover:shadow-glow transition-smooth"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading 
                ? (isEditMode ? 'Updating Trip...' : 'Creating Your Trip...') 
                : (isEditMode ? 'Update Trip' : 'Plan with AI')
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TripPlanner;